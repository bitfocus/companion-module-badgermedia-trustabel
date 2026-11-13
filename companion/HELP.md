## Badger Media Trustabel

Control the **Trustabel Network Adapter** (T-NA4) over its REST API (v2), letting you drive the label
panels attached to it. One connection controls every panel on the adapter. Panels are numbered 1–4 after
the adapter port they are plugged into.

The adapter must be in **server mode**. In protocol mode (TSL UMD) only adapter health, info,
power-cycle and reboot are available.

### Configuration

| Field              | Description                                     |
| ------------------ | ----------------------------------------------- |
| Network Adapter IP | Hostname or IP address of the adapter.          |
| Port               | HTTP port, normally `80`.                       |
| Bearer Token       | API token, as set in the panel's `config.json`. |

Every active panel is found automatically, and all of its labels are read and exposed as variables and feedbacks. A panel that
stops responding is reported in the log and its variables stop updating, without affecting the others.

### Actions

Label actions and feedbacks have a **Panel** option, listing each panel by number and name, and a
**Label** number. Labels are numbered from 1; label 1 is ID `0` in the panel's `config.json` and the
API documentation.

**Adapter**

- _Power-Cycle Panel_ — cuts and restores power to a panel.
- _Reboot_ — reboots the adapter. The API is unavailable while it restarts.

**Panel**

- _Refresh State_ — re-reads adapter, panel and label state immediately.

**Labels**

- _Flash_ / _Spotlight_ — temporary identification, by a list of label numbers (e.g. `1,2,5`) or `ALL` (1–60 seconds).
- _Set One Line_ / _Set All Lines_ — static label text and colors. If line 1 is empty the panel shows
  `RECOVERED`. Enable **Persist Changes** to save the configuration so it survives a power cycle.
- _Set Image Mode_ — switches a label to an image already stored on the panel (e.g. `logo.bin`).
- _Enable / Disable Dynamic Mode_ — toggles, enables or disables a label's dynamic mode. A label only
  accepts dynamic updates while this is on.
- _Show Dynamic Update_ — shows live text, color and/or status (`ok`, `error`, `warning`, `idle`,
  `unknown`) on a label, turning on its dynamic mode first if needed. Dynamic updates are not persisted.
- _Clear Dynamic Update_ — clears the dynamic text, resets the status to `ok` and turns dynamic mode off,
  so the label shows its static lines again.

The panel only displays plain ASCII text, so label and dynamic text is cleaned before it is sent:
accents are removed (`é` → `e`), some letters are spelled out (`ø` → `o`, `æ` → `ae`, `ß` → `ss`),
and anything else, such as emoji, is dropped.

### Feedbacks

- Panel - State
- Label - Dynamic Mode Enabled
- Label - Mode
- Label - Status
- Label - Line Text

### Variables

- Adapter: `adapter_model`, `adapter_firmware`, `adapter_build`, `adapter_uptime_s`,
  `adapter_serial_number`, `adapter_hostname`, `adapter_mode`, `adapter_ip`, `adapter_link`,
  `panel_count` (number of active panels)
- Per panel (1–4): `panel_<n>_state`, `panel_<n>_device_name`, `panel_<n>_serial_number`,
  `panel_<n>_firmware`, `panel_<n>_mode`, `panel_<n>_orientation`, `panel_<n>_screen_count`,
  `panel_<n>_label_count`
- Per label, as `panel_<n>_label_<number>_…` (numbered from 1): `text` (all non-empty lines, one per line), `display_text`
  (the dynamic text while dynamic mode is on and has text, otherwise the same as `text`),
  `line1..4`, `line1..4_color`, `mode`, `scale`, `image`, `dynamic`, `dyn_text`, `dyn_color`, `status`
