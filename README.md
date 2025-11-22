# PitchLab MK2 — Browser Vinyl Pitch & RPM Engine

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![Built with](https://img.shields.io/badge/Built%20with-React%20%7C%20TypeScript%20%7C%20Vite-blue)
![Targets](https://img.shields.io/badge/Targets-YouTube%20%7C%20Discogs%20%7C%20Bandcamp-orange)
![No Time Stretch](https://img.shields.io/badge/Time%20Stretch-OFF-critical)

PitchLab MK2 is a browser-based emulation of the Technics SL-1200 MK2 pitch section, designed for DJs and crate diggers who rely on **true pitch shifting** without timestretching artifacts.  
The extension applies an accurate playback-rate modification to media elements on YouTube, Discogs, and Bandcamp, providing a workflow similar to real vinyl decks.

This project also integrates with the **PitchLab MK2 Export App**, allowing real-time pitch control on locally loaded WAV files and exporting pitched audio offline.

---

## ✨ Features

### Accurate Vinyl Pitch Emulation

- ±8% pitch range  
- Independent **Origin RPM** (record speed) and **Playback RPM** (virtual platter speed)  
- Pitch calculation based on:
  ```text
  playbackRate = (rpmPlay / rpmOrig) * (1 + pitchPercent / 100)

