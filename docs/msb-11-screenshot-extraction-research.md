# MSB-11 Screenshot Extraction Research

## Task Summary

This task evaluates possible ways to extract screenshots from recorded usability test videos.

Screenshot extraction supports the larger Test4Test.io workflow. Recorded usability sessions need to be analyzed, screenshots need to be identified, transcript comments need to be connected to screens or visual components, and the results need to be displayed in a dashboard.

The three approaches reviewed were:

1. Fixed frame interval capture
2. Scene-change detection
3. Event-based capture

The recommended solution is a hybrid approach. The system should use scene-change detection as the main method. It should also use fixed frame interval capture as a fallback. Event-based capture can be added later if the project supports event logs.

---

## Approach 1: Fixed Frame Interval Capture

### Description

Fixed frame interval capture extracts screenshots at regular time intervals from a video. For example, the system could capture one screenshot every 1 second, 3 seconds, 5 seconds, or 10 seconds.

A 5-minute recording captured every 3 seconds would produce about 100 screenshots.

This approach could be implemented with FFmpeg or OpenCV. FFmpeg can extract image frames from video files. OpenCV can read video frame-by-frame with `VideoCapture`, which makes it possible to save frames at selected intervals.

### Benefits

- Simple to implement
- Low cost
- Uses open-source tools
- Predictable runtime
- Predictable storage needs
- Easy to test with sample videos
- Does not require AI or advanced event tracking
- Useful as a fallback method

### Drawbacks

- Produces many duplicate or nearly duplicate screenshots
- May miss quick screen changes between capture intervals
- Does not know whether the user interacted with the interface
- Can waste storage if the video is long and the screen does not change often
- Less useful for identifying meaningful usability moments

### Cost

Cost is low.

This approach can be built with open-source tools such as FFmpeg or OpenCV. It does not require a paid AI model or external API. The main costs are server compute time and image storage.

Storage cost depends on the capture interval. A shorter interval creates more screenshots. A longer interval creates fewer screenshots, but it increases the chance of missing important screen changes.

### Complexity

Complexity is low.

The implementation only needs to read the video file, select frames by timestamp or frame number, and save them as image files.

This makes fixed interval capture a good baseline method. It is also a good fallback if scene-change detection fails.

### Accuracy

Accuracy is medium-low.

This method reliably captures frames on schedule, but it does not know whether a frame is meaningful.

It may capture many duplicate screenshots when the screen is static. It may also miss important changes that happen between intervals. For example, if the system captures every 5 seconds, a short error message that appears for 2 seconds could be missed.

### Performance

Performance is high.

This method is predictable because the number of screenshots is controlled by the interval. For example, a 10-minute video captured every 5 seconds would produce about 120 screenshots.

This approach is usually faster than scene-change detection because it does not need to compare every frame for visual differences.

### Duplicate Screenshot Cleanup

Duplicate screenshots can be deleted after fixed interval capture to save space.

The system could compare screenshots after extraction and remove images that are visually identical or nearly identical. This could be done with image hashing, SSIM, or OpenCV frame comparison.

The important requirement is that timestamps or time ranges must still be preserved. If a duplicate screenshot is deleted, transcript quotes from that deleted screenshot's time range should still map to the closest kept screenshot or to a merged time range.

---

## Approach 2: Scene-Change Detection

### Description

Scene-change detection extracts screenshots when the video changes enough to suggest a new screen or interface state.

This could include a new page, modal, menu, form state, or major UI change. Instead of capturing frames at fixed times, the system compares frames. It saves a screenshot when the visual difference passes a selected threshold.

This approach can be implemented with FFmpeg scene detection, OpenCV frame comparison, or PySceneDetect.

PySceneDetect includes a `ContentDetector` that compares adjacent frames and triggers a scene cut when the difference passes a threshold. It also includes an adaptive detector that uses a rolling average, which may help reduce false detections in videos with rapid motion.

### Benefits

- Reduces duplicate screenshots
- Better matches the goal of identifying unique screens from recordings
- Uses less storage than fixed interval capture
- Captures major navigation changes better than fixed interval capture
- Can still be implemented with open-source tools
- Better supports transcript-to-screen linking

### Drawbacks

- Requires threshold tuning
- May capture too many frames during scrolling, cursor movement, loading screens, or transitions
- May miss subtle but important UI changes
- More complex than fixed interval capture
- Needs testing with real usability recordings

### Cost

Cost is low to medium.

The tool cost can still be low because FFmpeg, OpenCV, and PySceneDetect are available options. However, this method requires more processing than fixed interval capture because the system must analyze visual differences between frames.

Cost also depends on how many screenshots are saved. If the threshold is too sensitive, the system may save too many screenshots. That would increase storage and later AI-analysis costs.

### Complexity

Complexity is medium.

The team must choose a detection method, tune the threshold, and test the output on real usability recordings.

A simple implementation could start with PySceneDetect or FFmpeg scene detection. A more customized implementation could use OpenCV to compare frames directly. The OpenCV option gives more control, but it would take more development time.

### Accuracy

Accuracy is medium-high for major screen changes.

This method is better than fixed interval capture for detecting page changes, modal openings, navigation changes, and other large UI changes.

However, it is less accurate for subtle interface changes. Small text changes, brief validation messages, hover states, or disabled buttons may not create enough visual difference to pass the detection threshold.

Accuracy depends heavily on threshold tuning. A low threshold captures more changes but creates more false positives. A high threshold reduces noise but may miss important UI moments.

### Performance

Performance is medium-high.

Scene-change detection is slower than fixed interval capture because frames must be compared or scored. However, it can reduce the number of saved screenshots.

This tradeoff is useful for Test4Test.io. The system may spend more time analyzing the video, but it can save storage and reduce the number of screenshots that need later AI or dashboard processing.

### Quote Mapping

Scene-change detection does not automatically solve transcript quote mapping.

To preserve quote mapping, each extracted screenshot should be saved with a timestamp. Each screenshot can then represent the time range until the next detected screenshot.

For example:

- Screenshot A: 00:05 to 00:18
- Screenshot B: 00:18 to 00:31
- Screenshot C: 00:31 to 00:44

A transcript quote at 00:22 would map to Screenshot B.

This keeps transcript comments connected to the correct screen even when screenshots are not captured at fixed intervals.

---

## Approach 3: Event-Based Capture

### Description

Event-based capture extracts screenshots around meaningful user events instead of relying only on time intervals or visual changes.

Events could include:

- mouse clicks
- keyboard input
- scrolling
- page navigation
- form submissions
- URL changes
- DOM changes
- transcript timestamps

For usability testing, this is valuable because the system can capture screenshots when the user actually does something or says something important.

There are two main ways to implement this.

First, the system could capture events during the recording session. This could be done with browser-based session replay tools or custom event logging. Tools such as rrweb record DOM changes and replay them later with timestamps. OpenReplay can capture user interactions such as clicks, scrolls, inputs, and page changes.

Second, the system could infer events after upload. This would use the video, transcript, cursor movement, or audio to find important moments. This is more flexible because it can work with regular videos, but it is less reliable than having true event logs.

### Benefits

- Most directly useful for usability testing
- Connects screenshots to user intent
- Can reduce unnecessary screenshots
- Helps identify repeated confusion
- Helps identify repeated clicks, failed interactions, or common trouble spots
- Strong fit for transcript-to-component linking
- Could produce more meaningful findings than screenshots alone

### Drawbacks

- Hardest approach to implement
- Requires event logs, browser instrumentation, or advanced post-processing
- May not work with older recordings that only contain screen and audio
- Requires more integration with the database, AI analysis pipeline, and dashboard
- Has more privacy and security concerns because it may collect clicks, inputs, URLs, and page structure

### Cost

Cost is medium to high.

If event data is already available in the project, the cost would be lower. The team could use existing timestamps, clicks, navigation events, or transcript markers to decide when screenshots should be captured.

If event data is not already available, the cost would be higher. The team would need to build or integrate event logging. Possible options include rrweb, OpenReplay, Playwright tracing, or custom browser instrumentation.

The tool cost can still be low if open-source tools are used. However, the development cost is higher than fixed interval capture or scene-change detection.

This approach also creates more data to store and connect, such as event logs, timestamps, screenshots, transcript segments, and dashboard findings.

### Complexity

Complexity is high.

This method requires more than video processing. The system must collect events, timestamp them, connect them to screenshots, and store them in a format that the dashboard can use.

A browser-based version could use session replay technology. For example, rrweb records DOM changes and can replay sessions with timestamps. OpenReplay is another session replay option that can capture user interactions such as clicks, scrolls, inputs, and page changes.

Another possible option is Playwright tracing. Playwright traces can capture screenshots, DOM snapshots, user actions, network activity, console messages, and timing information.

This could be useful for controlled test sessions. However, it may not fit normal user-uploaded usability videos unless the recording workflow is built around Playwright.

### Accuracy

Accuracy can be high if true event logs are available.

If the system knows when the user clicked, typed, scrolled, changed pages, or submitted a form, it can capture screenshots around those timestamps. This makes the screenshots more likely to match the user's interaction.

Accuracy is lower if events have to be inferred after upload. Video-based inference may miss small events. Transcript-based inference may also be imprecise because a user might describe a problem before or after the matching screen action.

### Performance

Performance depends on how events are captured.

If events are logged during the recording session, performance can be good. The system can capture or select screenshots only around important timestamps. This may reduce the number of screenshots that need later processing.

If events are inferred after upload, performance is lower. The system may need to analyze the video, transcript, cursor movement, and screen changes. That takes more processing time than simple frame extraction.

### Privacy and Security Considerations

Event-based capture has the highest privacy risk.

It may collect page URLs, DOM content, typed input, clicks, scrolls, and user behavior. This could include sensitive information.

The system should avoid capturing passwords, hidden fields, personal data, and unnecessary page content.

If this approach is used, the team should consider masking sensitive inputs, limiting what events are stored, and protecting stored screenshots and event logs with proper access controls.

---

## Tool Comparison

| Tool or Method | Main Use | Strength | Limitation |
|---|---|---|---|
| FFmpeg fixed interval extraction | Capture frames at regular intervals | Simple and fast | Can create duplicates |
| FFmpeg scene detection | Detect visual scene changes | Good for major screen changes | Needs threshold tuning |
| OpenCV frame comparison | Custom frame comparison and duplicate cleanup | Flexible and customizable | More development work |
| PySceneDetect | Scene-change detection | Built for scene detection | Still needs tuning for UI recordings |
| rrweb | Browser session replay and DOM event logging | Strong event-level data | Requires browser instrumentation |
| OpenReplay | Session replay and interaction capture | Captures clicks, scrolls, inputs, and page changes | More integration work |
| Playwright tracing | Controlled browser trace capture | Captures actions, screenshots, DOM snapshots, and timing | Better for controlled tests than normal uploaded videos |

---

## Recommendation

The recommended approach is a hybrid method.

The system should use scene-change detection as the primary screenshot extraction method. It should also use fixed frame interval capture as a fallback.

Fixed interval capture is easy to implement and predictable. It is useful as a backup because it ensures the system still captures screenshots even if scene-change detection misses something. However, it can create many duplicate screenshots and may miss quick screen changes.

Scene-change detection is the best middle ground. It better identifies unique screens and can reduce unnecessary screenshots. It also helps reduce storage and later AI-processing costs. The main downside is that it requires threshold tuning and testing with real usability recordings.

Event-based capture is the strongest long-term option. It can connect screenshots more directly to user actions and transcript moments. However, it is also the most complex option. It should be treated as a future enhancement unless event data is already available in the project.

For the current capstone timeline, the recommended implementation is:

1. Use scene-change detection as the main method.
2. Use fixed interval capture as a fallback.
3. Preserve timestamps and time ranges for quote mapping.
4. Consider event-based capture later if the project supports event logs.

This gives the best balance of cost, complexity, accuracy, and performance.