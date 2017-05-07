<template>
	<div class="panel switcher" :class="classes">
		<div v-for="scene in obs.scenes" class="scene" :class="{active: scene.name == obs.currentScene}"
			@click.stop.prevent="switchToScene(scene)">
			<div class="scene-text">{{scene.name}}</div>
			<div v-if="scene.name == obs.currentScene" class="scene-text scene-time">{{sceneSwitchedTimeDisplay}}</div>
		</div>
	</div>
</template>

<script>
	import OBSUserMixin from '../../mixins/obs-user'

	export default {
		mounted: function() {
			var scope = this;
			setInterval(function() {
				scope.calculateTimeSinceSwitch();
			}, 1000);

			this.$obs.on('scenes.switch', function() {
				scope.resetSceneSwitchedTime();
			});
		},

		computed: {
			classes() {
				return 'per-row-' + this.settings.switcher.perRow
			}
		},

		methods: {
			switchToScene(scene) {
				this.resetSceneSwitchedTime();
				if (this.settings.switcher.transitionScene !== "") {
					this.$obs.setCurrentScene(this.settings.switcher.transitionScene);
					var scope = this;
					setTimeout(function() {
						scope.resetSceneSwitchedTime();
						scope.$obs.setCurrentScene(scene.name);
					}, this.settings.switcher.transitionSeconds * 1000);
				} else {
					this.$obs.setCurrentScene(scene.name)
				}
			},

			resetSceneSwitchedTime() {
				this.sceneSwitchedTime = Date.now();
				this.sceneSwitchedTimeDisplay = 'just now';
			},

			calculateTimeSinceSwitch() {
				var milliseconds = (Date.now() - this.sceneSwitchedTime);
				var temp = Math.floor(milliseconds / 1000);

				function numberEnding(number) {
					return (number > 1) ? 's' : '';
				}

				var hours = Math.floor((temp %= 86400) / 3600);
				if (hours) {
					this.sceneSwitchedTimeDisplay = hours + ' hour' + numberEnding(hours);
					return;
				}

				var minutes = Math.floor((temp %= 3600) / 60)
				if (minutes) {
					this.sceneSwitchedTimeDisplay = minutes + ' minute' + numberEnding(minutes);
					return;
				}

				var seconds = temp % 60;
				if (seconds) {
					this.sceneSwitchedTimeDisplay = seconds + ' second' + numberEnding(seconds);
					return;
				}

				this.sceneSwithedTimeDisplay = 'just now';
			}
		},

		mixins: [OBSUserMixin],

		props: {
			obs: Object,
			settings: Object,
			sceneSwitchedTimeDisplay: {
				type: String,
				default: 'switched just now'
			},
			sceneSwitchedTime: {
				type: Number,
				default: Date.now()
			}
		}
	}
</script>
