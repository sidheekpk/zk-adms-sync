# Phase 1 acceptance checklist

Walk through every item below on a real V5L device. Each item is a pass/fail. **Phase 1 is signed off when every box is checked.**

## Setup before testing
- [ ] ADMS service running (`pnpm --filter @zkc/adms dev`)
- [ ] Web app running (`pnpm --filter @zkc/web dev`)
- [ ] The SpeedFace V5L (SN CL5Z202760301) is powered on, on the LAN, with Cloud Server pointing at this Mac

---

## Acceptance criteria

### 1. Pairing flow (Phase 1.5)
- [ ] Open `Devices` page on a tenant, click **Add device**
- [ ] The "Waiting for device handshake" panel is visible (blue, animated)
- [ ] The Cloud Server values shown are correct (Server Address = `192.168.68.x`, Port = `8080`, Server Mode = ADMS)
- [ ] A pairing token is auto-generated and visible
- [ ] The token expiry counter ticks down ("Expires in 59m → 58m → …")
- [ ] **Re-issue** button generates a new token
- [ ] (If you have a spare device) Factory reset it, point Cloud Server at this server, save. Within 10 seconds the green "Device paired successfully" panel appears.
- [ ] Troubleshooting panel is visible (amber, lists 5 common issues)

### 2. Device list & detail (Phase 1.0 — existed)
- [ ] Device list shows the V5L with its name, SN, online status, last-seen
- [ ] Clicking the device opens its detail page
- [ ] **Live clock** on the detail page ticks every second
- [ ] **Live clock** matches the device screen within ±5 seconds (set device time via menu if it doesn't)
- [ ] **Drift card** shows current drift (green when accurate, red when off)

### 3. Network card (Phase 1.3)
- [ ] **Network** card is visible alongside Timezone and Capabilities
- [ ] Click the small refresh button → toast "Network query queued — refresh in ~10s"
- [ ] Within ~25 seconds, the card populates with IP, Netmask, Gateway, DNS, DHCP status
- [ ] The amber "Read-only" warning is visible at the bottom of the card

### 4. Settings audit (Phase 1.1)
Open the device's Settings page. For each tab, change one value and click "Push to device":

- [ ] **Display** — change Volume from 70 to 40. Save & push. Refresh page. Volume shows 40.
- [ ] **Format** — change Date format. Refresh. New format shown.
- [ ] **Access** — change Lock open duration. Refresh. New duration shown.
- [ ] **Verify** — change Fingerprint 1:N threshold. Refresh. New value shown.
- [ ] **Push** — change Heartbeat interval. Refresh. New interval shown.

For each, also check:
- [ ] A row appears in the **Recent commands** sidebar with status = success

### 5. Time tab (Phase 1.4 — capability matrix)
- [ ] Open the Settings → Time tab
- [ ] **Drift card** is visible
- [ ] **Set device time** card is visible
- [ ] On V5L, the card shows the **amber "remote time-set not supported"** banner (instead of a Push button)
- [ ] The card guides operator to **Menu → System → Date Time → Manual Date and Time**

### 6. Maintenance actions (Phase 1.6)
For each maintenance action, click the button → operator-password modal appears → enter password → enter reason → confirm:

- [ ] **Clear attendance log** — succeeds, device's local punch log is cleared, attendance count drops to 0 (verify on device menu)
- [ ] **Clear fingerprints** — succeeds, fingerprint count drops to 0 on device
- [ ] **Clear faces** — succeeds, face count drops to 0
- [ ] **Clear photos** — succeeds (may be 0 already)
- [ ] **Reboot device** (from device detail page, not Settings tab) — device reboots, comes back online within 60s
- [ ] **Factory reset** — ⚠️ skip this unless you want to re-pair afterwards
- [ ] After each action, the **Audit log** page shows the action with the operator email + reason

### 7. Status & health (Phase 1.0)
- [ ] Power off the device. Within 30 seconds, the notification bar at the top shows "Device offline"
- [ ] Power on the device. Notification bar clears within ~30s, device flips back to online
- [ ] The "Pause device" toggle disables a device (stops accepting commands)
- [ ] "Resume device" re-enables it

### 8. Audit log (existed)
- [ ] Sidebar → Audit log shows every action taken in steps 4–6
- [ ] Each row shows: operator email, action, target, reason, timestamp
- [ ] Filter by action / actor works

### 9. Timezone label
- [ ] Settings → click "Edit timezone" (on TimezoneCard)
- [ ] Change to a different IANA timezone
- [ ] Click "Save label". Toast confirms.
- [ ] Page refresh shows new timezone label.
- [ ] The card explicitly says "This label is used by our ingestion. It does NOT change the device's on-screen clock."

### 10. Integrations is hidden (Phase 1.9)
- [ ] Sidebar shows: Dashboard / Devices / Members / Attendance / Audit log / Settings
- [ ] **No** "Integrations" entry (parked until Phase 6)

---

## Result

If every box is checked: **Phase 1 closed**. Move to Phase 2 (Attendance).

If anything fails: log the failure here, we fix, re-test that line only.

---

## Known-acceptable behavior in Phase 1

These are limitations we explicitly chose to ship with — not bugs:

1. **Sound test button is absent.** SpeedFace V5L firmware has no command that triggers an audible beep remotely. Sound verification is via real punch only (device beeps on verify).
2. **Manual time push on V5L doesn't work.** The Settings → Time tab shows the amber banner and the device menu instruction. This is correct behavior; SpeedFace V5L firmware silently ignores `SET OPTIONS DateTime`.
3. **Network values are read-only.** We can read IP/DHCP/etc. but never write them from ADMS (would risk bricking the LAN connection). Editing IP/DNS comes with the LAN Agent in a later release.
4. **Stale IPAddress in the Network card.** If the device was configured with a static IP on a prior network and is now on DHCP, the firmware keeps BOTH values internally. The card shows the static-config IP, not the DHCP-assigned one. This is the firmware's data, not a bug in our display. The current LAN-assigned IP can be seen on the device menu (COMM → Ethernet).
5. **Single-field GET OPTIONS for `IPAddress`** returns empty on V5L. We use a multi-field GET instead — works correctly.
