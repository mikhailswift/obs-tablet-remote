import EventEmitter from 'events'
import Sha256Hash from 'sha.js/sha256'

export default class OBSRemote extends EventEmitter {

	/**
	 * Create an instance of OBS remote connection
	 *
	 * @param host
	 * @param port
	 */
	constructor(host = 'localhost', port = 4444) {
		super()

		this.debug = false
		this.host = host
		this.port = port

		this._connecting = null
		this._idCounter = 1
		this._promises = {}
		this._socket = undefined
	}

	/**
	 * Connect to OBS remote
	 *
	 * @returns {Promise}
	 */
	connect() {
		if (this._socket) {
			this._socket.onopen = this._socket._onmessage = this._socket.onerror = this._socket._onclose = null
			this._socket.close()
		}

		return new Promise((resolve, reject) => {
			this._connecting = {resolve, reject}

			const url = 'ws://' + this.host + ':' + this.port
			this._socket = new WebSocket(url)

			this._socket.onopen = socketOnOpen.bind(this)
			this._socket.onmessage = socketOnMessage.bind(this)
			this._socket.onerror = socketOnError.bind(this)
			this._socket.onclose = socketOnClose.bind(this)
		})
	}

	/**
	 * Sends raw message to OBS remote
	 *
	 * @param message
	 * @returns {Promise}
	 */
	send(message) {
		return new Promise((resolve, reject) => {
			if (this._socket) {
				const id = this._nextID()
				this._promises[id] = {resolve, reject}

				message['message-id'] = id

				this._socket.send(JSON.stringify(message))
			} else {
				throw new Error('Connection isn\'t opened')
			}
		})
	}

	/**
	 * Convenience method for logging in
	 *
	 * @param password
	 * @returns {Promise}
	 */
	login(password) {
		return this.getAuthRequired().then(({authRequired, salt, challenge}) => {
			if (authRequired) {
				if (!password) {
					throw new Error('Password Required')
				}

				let authHash = new Sha256Hash()
				authHash.update(password)
				authHash.update(salt)
				authHash = authHash.digest('base64')

				let authResponse = new Sha256Hash()
				authResponse.update(authHash)
				authResponse.update(challenge)
				authResponse = authResponse.digest('base64')

				return this.authenticate(authResponse).then(() => {
					this.emit('ready')

					return true
				}, error => {
					throw error.error
				})
			}
			return true
		})
	}

	/**
	 * Close socket connection
	 */
	close() {
		if (this._socket) {
			this._socket.close()
		}
	}

	/**
	 * OBS Remote Authenticate method
	 *
	 * @param auth
	 * @returns {Promise}
	 */
	authenticate(auth) {
		return this.send({
			'request-type': 'Authenticate',
			auth
		})
	}

	/**
	 * OBS Remote GetAuthRequired method
	 *
	 * @returns {Promise}
	 */
	getAuthRequired() {
		return this.send({'request-type': 'GetAuthRequired'})
	}

	/**
	 * OBS Remote GetSceneList method
	 *
	 * @returns {Promise}
	 */
	getSceneList() {
		return this.send({'request-type': 'GetSceneList'})
	}

	/**
	 * OBS Remote GetVersion method
	 *
	 * @returns {Promise}
	 */
	getVersion() {
		return this.send({'request-type': 'GetVersion'})
	}

	/**
	 * OBS Remote SetCurrentScene method
	 *
	 * @param sceneName
	 * @returns {Promise}
	 */
	setCurrentScene(sceneName) {
		return this.send({'request-type': 'SetCurrentScene', 'scene-name': sceneName})
	}

	/**
	 * OBS Remote SetSourceRender method
	 *
	 * @param scene ignored
	 * @param source
	 * @param render
	 * @returns {Promise}
	 */
	setSourceRender(scene, source, render) {
		return this.send({'request-type': 'SetSourceRender', 'scene-name': scene, source, render})
	}

	/**
	 * Get ID for next request
	 *
	 * @returns {string}
	 * @private
	 */
	_nextID() {
		return String(this._idCounter++)
	}
}

/**
 * Handle socket opening
 */
function socketOnOpen() {
	if (this._connecting) {
		const resolve = this._connecting.resolve
		Promise.all([this.getVersion(), this.getAuthRequired()]).then(([version, authRequired]) => {
			resolve({
				version: version['obs-websocket-version'] || version.version,
				auth: authRequired.authRequired
			})

			if (!authRequired.authRequired) {
				this.emit('ready')
			}
		})
		this._connecting = null
	}
	this.emit('socket.open')
}

/**
 * Handle socket messages
 *
 * @param message
 */
function socketOnMessage(message) {
	let received
	try {
		received = JSON.parse(message.data)
	} catch (err) {
		this.emit('error', err)
	}

	if (!received) {
		return
	}

	if (this.debug) {
		console.log(received)
	}

	const type = received['update-type']
	if (type) {
		handleUpdate.call(this, type, received)
	} else {
		handleCallback.call(this, received['message-id'], received)
	}
}

/**
 * Handle socket errors
 *
 * @param error
 */
function socketOnError(error) {
	this.emit('socket.error', error)
}

const disconnectReasons = {
	1006: 'Server not reachable'
}

/**
 * Handle socket close events
 *
 * @param event
 */
function socketOnClose(event) {
	if (this._connecting) {
		let message = 'Unknown Error'
		if (event.code in disconnectReasons) {
			message = disconnectReasons[event.code]
		}
		this._connecting.reject({error: message, event})
		this._connecting = null
	}

	this.emit('socket.close')
}

/**
 * Handle responses from server
 *
 * @param id
 * @param message
 */
function handleCallback(id, message) {
	const promise = this._promises[id]
	if (promise) {
		if (message.status === 'error') {
			promise.reject(message)
		} else {
			promise.resolve(message)
		}
		delete this._promises[id]
	} else if (message.status === 'error') {
		this.emit('error', message.error, message)
	}
}

/**
 * Handle general updates
 *
 * @param type
 * @param message
 */
function handleUpdate(type, message) {
	switch (type) {
		case 'StreamStatus':
			this.emit('stream.status', message)
			break
		case 'StreamStarting':
			this.emit('stream.start', message)
			break
		case 'StreamStopping':
			this.emit('stream.stop', message)
			break
		case 'SwitchScenes':
			this.emit('scenes.switch', message)
			break
		case 'ScenesChanged':
			this.emit('scenes.change', message)
			break
		case 'SourceOrderChanged':
			this.emit('sources.order', message)
			break
		case 'SourceChanged':
			this.emit('source.change', message)
			break
		case 'RepopulateSources':
			this.emit('source.repopulate', message)
			break
		case 'VolumeChanged':
			this.emit('volume.change', message)
			break
		default:
			// Unhandled
	}
}
