// ==UserScript==
// @name         YT Video More Duration Stats
// @namespace    ByManab
// @source       https://github.com/ManabBala/yt-video-more-duration-stats
// @supportURL   https://github.com/ManabBala/yt-video-more-duration-stats
// @version      1.0.1
// @description  This will show the time spent on the video, video's modified duration according to playback speed, time left of the video, percent been watched and percent left.
// @author       Manab Bala
// @match        *://*.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-start
// ==/UserScript==

(function () {
	("use strict");

	let oldLog = console.log;
	/**
	 * Custom logging function copied from `console.log`
	 * @param  {...any} args `console.log` arguments
	 * @returns {void}
	 */
	const logger = (...args) =>
		oldLog.apply(console, ["\x1b[31m[YT Video Detector]\x1b[0m", ...args]);

	logger("YT Video Detector Launched!");

	// adding custom css style
	GM_addStyle(`
	#top-overlay-container {         
		position: absolute;
		top: 0;
		left: 0;
		margin: 20px;
		z-index: 9999;
	}

	#timer-top-overlay {
    color: white;
    background: rgba(255, 255, 255, 0.2);
    font-size: medium;
    padding: 5px;
    border-radius: 5px;
	}

	#duration-parent {
		font-size: medium;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 10px;
		padding: 3px
	}

	`);

	/**
	 * https://stackoverflow.com/a/61511955
	 * @param {String} selector The CSS selector used to select the element
	 * @returns {Promise<Element>} The selected element
	 */
	function waitForElement(selector) {
		return new Promise((resolve) => {
			if (document.querySelector(selector)) return resolve(document.querySelector(selector));

			const observer = new MutationObserver(() => {
				if (document.querySelector(selector)) {
					observer.disconnect();
					resolve(document.querySelector(selector));
				}
			});

			observer.observe(document.body, { childList: true, subtree: true });
		});
	}

	/**
	 * Detect which YouTube service is being used
	 * @returns {"SHORTS" | "MUSIC" | "YOUTUBE" | null}
	 */
	function updateService() {
		if (
			window.location.hostname === "www.youtube.com" &&
			window.location.pathname.startsWith("/shorts")
		)
			return "SHORTS";
		else if (window.location.hostname === "music.youtube.com") return "MUSIC";
		else if (
			window.location.hostname === "www.youtube.com" &&
			window.location.pathname.startsWith("/watch")
		)
			return "YOUTUBE";
		else return null;
	}

	// storing last video id to cancel video's event listener
	let lastVideoId = null;

	/**
	 * render function after completion of youtube navigation/load
	 * @param {CustomEvent} event The YouTube custom navigation event
	 * @returns {Promise<void>}
	 */
	async function render(event) {
		logger("Render Function Launched");
		// logger("YT Navigate Event: ", event);

		if (
			!document.querySelector("#top-overlay-container") &&
			!document.querySelector("#bottom-timer-container")
		) {
			logger("Overlays don't exist, creating new.");
			// --------------------top overlays------------------
			const topOverlayContainerEl = document.createElement("div");
			topOverlayContainerEl.id = "top-overlay-container";

			let ytd_player = await waitForElement("#ytd-player");
			// logger("Youtube player element found", ytd_player);

			ytd_player.insertAdjacentElement("afterend", topOverlayContainerEl);
			// logger("Top Overlay Element Added");

			const timerOverlayEl = document.createElement("div");
			timerOverlayEl.id = "timer-top-overlay";
			timerOverlayEl.title = "Time Spent on this video";

			topOverlayContainerEl.append(timerOverlayEl);

			// -----------------bottom overlays-----------------
			let rawHTML = `
				<span id="duration" title="Duration in normal playback speed" style="color: rgb(255, 255, 23);">
					0:00
				</span>
				<span>(</span>
				<span id="duration-left" title="Duration left in normal playback speed" style="color: rgb(252, 26, 37);">
					-0:00
				</span>
				<span>)</span>
				<span> | </span>
				<span id="speed-timer-container" hidden="undefined">
					<span id="speed-duration" title="Duration with modified playback speed" style="color: rgb(146, 255, 146);">
						0:00
					</span>
					<span>(</span>
					<span id="speed-duration-left" title="Duration left with modified playback speed" style="color: rgb(252, 26, 37);">
						-0:00
					</span>
					<span>)</span>
					<span> | </span>
				</span>
				<span id="percent-done" title="Percentage of the video been watched" style="color: rgb(146, 255, 146);">
					0%
				</span>
				<span>(</span>
				<span id="percent-left" title="Percent of video left" style="color: rgb(252, 26, 37);">
					-100%
				</span>
				<span>)</span>
			`;

			// yt's own duration element to attach bottom timer-overlay
			let nativeDurationEl = await waitForElement(".ytp-time-duration");
			// logger("Old Duration Element found:", nativeDurationEl);
			let durationParentEl = nativeDurationEl.parentElement;
			durationParentEl.id = "duration-parent";
			nativeDurationEl.remove(); // remove native duration el

			let bottomTimerContainer = document.createElement("span");
			bottomTimerContainer.id = "bottom-timer-container";
			bottomTimerContainer.innerHTML = rawHTML;
			// append bottom timer controller as last child
			durationParentEl.appendChild(bottomTimerContainer);

			logger("Overlays creation done");
		} else {
			logger("Overlay Elements Already Exist!");
		}
	}

	// initializing new timer for the newly found video data
	async function initiateTimerForVideo(VIDEO_DATA) {
		// setting lastVideoId
		lastVideoId = VIDEO_DATA.video_id;

		// old stored data about video if any
		let oldTimeCounter = GM_getValue(VIDEO_DATA.video_id, null);
		logger("Videos's old Counter: ", oldTimeCounter);

		// get all the elements
		let videoEl = await waitForElement("video");
		let timerOverlayEl = await waitForElement("#timer-top-overlay");
		let durationEl = await waitForElement("#duration");
		let durationLeftEl = await waitForElement("#duration-left");
		let speedTimerContainerEl = await waitForElement("#speed-timer-container");
		let speedDurationEl = await waitForElement("#speed-duration");
		let speedDurationLeftEl = await waitForElement("#speed-duration-left");
		let percentDoneEl = await waitForElement("#percent-done");
		let percentLeftEl = await waitForElement("#percent-left");

		// --------------Timer Function-----------------
		let timeCounter = oldTimeCounter || 0;
		let timeCurrentLast = 0;
		let timeDelta = 0;
		let storeValueCounter = 0;

		// format time
		function formatTime(seconds) {
			const h = Math.floor(seconds / 3600);
			const m = Math.floor((seconds % 3600) / 60);
			const s = Math.round(seconds % 60);
			const t = [h, m > 9 ? m : h ? "0" + m : m || "0", s > 9 ? s : "0" + s]
				.filter(Boolean)
				.join(":");
			return seconds < 0 && seconds ? `-${t}` : t;
		}

		function updateVideoDurations(videoEl) {
			// current_time/duration(-duration_left) | speed_duration(-left_speed_duration) | percent_done%(-percent_left%)
			// 3:15/10:30(-6:25) | 5:18(-2:31) | 53%(-47%)
			let currentTime = videoEl.currentTime;
			let duration = videoEl.duration;

			durationEl.innerText = formatTime(duration || 0);
			durationLeftEl.innerText = `-${formatTime(duration - currentTime || 0)}`;

			let playbackRate = videoEl.playbackRate;
			// if playback speed other than 1 show speedTimer and update
			if (playbackRate !== 1) {
				speedTimerContainerEl.removeAttribute("hidden");
				speedDurationEl.innerText = formatTime(duration / playbackRate || 0);
				speedDurationLeftEl.innerText = `-${formatTime(
					(duration - currentTime) / playbackRate || 0
				)}`;
			} else {
				speedTimerContainerEl.setAttribute("hidden");
			}

			let percentDone = Math.round((currentTime / duration) * 100);
			percentDoneEl.innerText = `${percentDone || 0}%`;
			percentLeftEl.innerText = `-${100 - percentDone || 0}%`;
		}

		function updateTopTimer(e) {
			const elVideo = e.target;
			let playBackSpeed = elVideo.playbackRate;

			// checks if there is a new video and cancel the EL
			if (lastVideoId !== null && lastVideoId !== VIDEO_DATA.video_id) {
				stopTracking();
				logger(
					"Old video's Event Listener omitted, old id:",
					VIDEO_DATA.video_id,
					":",
					VIDEO_DATA.video_title,
					":",
					"Current Id:",
					lastVideoId
				);
				return;
			}

			const tempDelta = elVideo.currentTime - timeCurrentLast;
			// Only record normal playing to correctly assess the X% threshold
			if ((tempDelta > 0 && tempDelta < 1) || tempDelta < 0) {
				timeDelta = tempDelta;
			}

			// timeCounter += timeDelta || 0;
			if (timeDelta > 0) {
				// sync timeDelta according to playBackSpeed
				// for avi12 it is not needed as he was calculating total video watched
				timeDelta = timeDelta / playBackSpeed;

				timeCounter += timeDelta || 0;

				// function to store timeCounter in local storage
				// as soon as 5 sec passed store the timeCounter value and reset the storeValueCounter
				if (storeValueCounter <= 5) {
					storeValueCounter += timeDelta || 0;
				} else {
					GM_setValue(VIDEO_DATA.video_id, Math.floor(timeCounter));
					storeValueCounter = 0; // resetting counter
					// logger(
					// 	`Storing video's(${VIDEO_DATA.video_id}) timeCounter(${Math.floor(
					// 		timeCounter
					// 	)}) to local storage`
					// );
				}
			}

			// TODO: think don't need. will reevaluate
			if (timeCounter < 0) {
				timeCounter = 0;
			}

			timeCurrentLast = elVideo.currentTime;

			percentageWatched = parseFloat((timeCounter / elVideo.duration) * 100).toFixed(2) || 0;

			// logger(`timeCounter: ${Math.floor(timeCounter)}, timeDelta: ${timeDelta}`);

			// update top overlay with time spent timer
			timerOverlayEl.innerText = formatTime(timeCounter);
		}

		// ------------------ YT video's time update listener ------------------
		const videoListener = new AbortController();
		function startTracking(elVideo) {
			elVideo.addEventListener(
				"timeupdate",
				(e) => {
					// if add playing then skip the video update listener.
					// TODO: ELEMENT.style.display not working!
					const isAdPlaying = Boolean(document.querySelector(".video-ads").checkVisibility());
					if (isAdPlaying) {
						logger("add running, skipping video update listener");
						return;
					}

					updateTopTimer(e);
					updateVideoDurations(e.target);
				},
				{ signal: videoListener.signal }
			);
		}

		function stopTracking() {
			videoListener.abort();
		}

		startTracking(videoEl);
	}

	// ------------------ Youtube player video change listener ------------------
	let VIDEO_DATA;
	document.addEventListener("yt-player-updated", (e) => {
		// check if valid video data present(else error while no internet and video preview on main page)
		if (e.target.id !== "ytd-player") {
			logger("Not valid/inline Video, skipping timer update");
			return;
		}

		// console.log("Video detect event: ", e);
		const temp_video_data = e.detail.getVideoData();

		VIDEO_DATA = {
			current_time: e.detail.getCurrentTime(),
			video_duration: e.detail.getDuration(),
			video_url: e.detail.getVideoUrl(),
			video_author: temp_video_data?.author,
			video_title: temp_video_data?.title,
			video_id: temp_video_data?.video_id,
		};

		logger("Video data updated", VIDEO_DATA);
		initiateTimerForVideo(VIDEO_DATA);
	});

	// ------------------- Youtube navigation handler ---------------------------
	let YOUTUBE_SERVICE = updateService();
	["yt-navigate", "yt-navigate-finish"].forEach((evName) =>
		document.addEventListener(evName, (e) => {
			YOUTUBE_SERVICE = updateService();
			logger("Service is:", YOUTUBE_SERVICE);
			// if not youtube main video like yt short then return
			if (!YOUTUBE_SERVICE) return;
			render(e);
		})
	);
})();
