# Real YouTube Baseline

- Run date: 2026-11-04T09:24:29.037Z
- Room: 5VDUNV
- Duration: 180 seconds
- Source: real YouTube IFrame API, visible 640x360 players; no player test double.
- Automation: local Chromium launched with `--autoplay-policy=no-user-gesture-required`.
- Scenarios: start, seek at 45s, pause at 75s, resume at 85s, track change at 120s, guest-2 reconnect at 150s.
- Offset definition: for each guest sample, absolute `getCurrentTime()` difference from the nearest host sample on the same track within 300ms. Host row is absolute error from its shared expected timeline.

| Client | Samples | Min ms | Avg ms | p95 ms | Max ms | Clock RTT ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| host | 360 | 2.3 | 943.7 | 1837.4 | 1838.2 | 0.7 |
| guest-1 | 360 | 0.0 | 360.0 | 1657.9 | 1674.2 | 0.6 |
| guest-2 | 358 | 0.0 | 320.6 | 1647.7 | 1664.2 | 0.9 |
| guest-3 | 360 | 0.0 | 708.5 | 2477.5 | 2561.9 | 1.0 |

## getCurrentTime Sampling Probe

The IFrame API documentation specifies a numeric elapsed time in seconds but does not promise a precision/resolution bound. The probe sampled every 50ms while playing:

| Client | Distinct reported values | Smallest observed positive step ms |
| --- | ---: | ---: |
| host | 77 | 60.0 |
| guest-1 | 77 | 53.0 |
| guest-2 | 77 | 59.0 |
| guest-3 | 78 | 51.0 |

## Caveats

These are local browser measurements against YouTube's real embedded player. They do not measure acoustic output latency (Bluetooth/OS/device), and a single local Chromium process is not a remote-listener or same-room multi-speaker certification. Server `SYNC:MEASUREMENT` lines include receive time and the client-provided estimated server time. No physical mobile devices were used.
