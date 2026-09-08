## Badger Media Trustabel

Controls a **trustabel Network Adapter** over its REST API (API v1.4), letting you drive the label
panels attached to the adapter.

### Configuration

| Field                    | Description                                                                   |
| ------------------------ | ----------------------------------------------------------------------------- |
| Network Adapter IP       | Hostname or IP address of the adapter.                                        |
| Port                     | HTTP port, normally `80`.                                                     |
| Bearer Token             | API token                                                                     |
| Number of labels to poll | Labels `0..n-1` are read on each poll and exposed as variables and feedbacks. |
| Poll interval            | How often to refresh panel and label state, in seconds. `0` disables polling. |

### Actions

**Panel**

- _Wake Backlight_ — turns the backlight on and resets its timeout.
- _Refresh State_ — Manually re-reads health, info and all labels immediately.
- _Set Mode & Orientation_ — writes panel mode (single/dual) and orientation (above/below).
  **This reboots the panel**, and the API is unavailable while it restarts.

**Screens**

- _Set display state_ — turn screens on or off, by screen ID list or `ALL`.
- _Flash_ / _Spotlight_ — temporary identification, by screen ID list or `ALL`.

**Labels**

- _Flash_ / _Spotlight_ — temporary identification, by label ID list or `ALL`.
- _Set One Line_ / _Set All Lines_ — static label text and colors. Enable **Persist to flash** to
  save the configuration so it survives a power cycle.
- _Set Image Mode_ — switches a label to an image already stored on the panel.
- _Enable / Disable Dynamic Mode_ — a label only accepts dynamic updates while this is on.
- _Dynamic Update_ — sets dynamic text, color and/or status.

### Feedbacks

- Label - Dynamic Mode Enabled
- Label - Mode
- Label - Status
- Label - Line Text Matches

### Variables

- `health` and `info`
- Per label: `label_<id>_line1..4`, `label_<id>_line1..4_color`, `label_<id>_mode`,
  `label_<id>_scale`, `label_<id>_image`, `label_<id>_dynamic`, `label_<id>_dyn_text`,
  `label_<id>_dyn_color`, `label_<id>_status`
