# Connect a ZK device to ZK Connect

Audience: site operators bringing a new ZKTeco biometric device online for the first time on this platform.

Time required: **5–10 minutes**, plus 1 minute of waiting for the first handshake.

## What you need

- The device powered on, on the local network (Ethernet recommended; Wi-Fi works if your model supports it).
- Network access from the device to the ZK Connect server (the host name your admin tells you, e.g. `adms.zkconnect.example.com`).
- Admin access on the device (default operator password varies — many ship with `0` or no password).
- A logged-in operator on ZK Connect with permission to add devices to the tenant.

## Supported devices

Any ZKTeco device that supports the ADMS PUSH protocol. Tested:

| Family | Examples | Notes |
|---|---|---|
| SpeedFace | V5L (ZAM170-NF), V4L, V3 | Linux-based, full biometric. Time-set is menu-only. |
| BioTime / iClock | iClock 580/680, BioPro | Most settings remote-controllable. |
| iFace | iFace 302/402/702 | Older firmware, conservative defaults. |
| Green Label | SilkBio | Fingerprint + card only. |

If your device isn't listed, try anyway — the platform falls back to a conservative profile for unknown firmware.

---

## Step 1 — Confirm the device is on the network

On the device:

1. **Menu → COMM → Ethernet** (or **WiFi**, if the unit doesn't have Ethernet).
2. Set **DHCP = ON**.
3. Save and exit. Wait a few seconds for the device to grab a DHCP lease.
4. Re-enter the same screen. You should see an **IP Address** like `192.168.x.x`.

If the device shows `0.0.0.0` or never gets an IP:
- The Ethernet cable might not be plugged in / not link up.
- The network might not have DHCP running.
- The device's existing static IP config may be conflicting — set DHCP back to OFF, then ON again to refresh.

---

## Step 2 — Issue a pairing token in ZK Connect

In ZK Connect, navigate to:

**Sidebar → your tenant → Devices → "Add device"**

A dialog opens with:
- A list of **Cloud Server values** to type on the device (Server Address, Port, etc.)
- A **pairing token** displayed on the right (auto-generated)
- A "Waiting for device handshake" panel that auto-detects when the device pairs

**You do NOT need to type the token on the device.** It's a server-side handle that says "the next new device that handshakes is mine". Tokens are good for 60 minutes.

Keep this dialog open while you configure the device.

---

## Step 3 — Configure Cloud Server on the device

On the device:

**Menu → COMM → Cloud Server Setting**

Type the **exact** values shown in the ZK Connect dialog. Common values:

| Field | Value |
|---|---|
| Server Mode | `ADMS` |
| Enable Domain Name | `OFF` (we'll use IP / hostname directly) |
| Server Address | the hostname or IP shown in the dialog |
| Server Port | the port shown in the dialog (usually `8080` in dev, `443` in production) |
| HTTPS | `ON` if production (port 443), `OFF` if dev (port 8080) |
| Enable Proxy Server | `OFF` |

Save and exit. The device may **reboot once** — let it.

After reboot, the **status icon on the home screen** should be green. If you see a red database icon flashing in the top status bar, the device is failing to reach our server — see troubleshooting below.

---

## Step 4 — Watch ZK Connect for the handshake

The "Waiting for device handshake" panel will turn **green within ~10 seconds** of a successful first heartbeat. You'll see the device's serial number and assigned name.

If it doesn't appear after 60 seconds, see the troubleshooting section.

You can close the dialog now. Open the device from the device list to configure further.

---

## Step 5 — Set the device timezone (manual)

This is the one step we can't do remotely on most firmware. Once the device is paired:

**Menu → System → Date Time → Timezone**

Select the correct GMT offset for your site (e.g. `GMT+05:30` for India, `GMT+04:00` for Dubai).

**Then** confirm the wall-clock time shows correctly. If not:

**Menu → System → Date Time → Manual Date and Time** — enter the current local date and time.

⚠️ **Why this is manual:** SpeedFace V5L firmware silently accepts `SET OPTIONS DateTime` from ADMS (no error) but never applies it. The wall-clock offset is owned by the menu's Timezone selector, which has no remote API surface. This will improve in a future release that adds a LAN-side agent.

---

## Troubleshooting — device not showing up

In rough order of probability:

### 1. Server Address typo

Most common. `192.168.x.x` vs `192.16.x.x` is a known foot-gun (operators read off the dialog and slip a digit). Re-check character-by-character on the device.

### 2. Wrong port / wrong HTTPS setting

In dev, port `8080` + HTTPS OFF.  
In production, port `443` + HTTPS ON.  
Mismatching these (e.g. HTTPS ON but port 8080) makes the device fail silently.

### 3. The device can't reach the server

From the same network the device is on, try:

```
ping <server address>
curl http://<server address>:<port>/health
```

If the ping fails, the device can't reach the server. Check the firewall / VLAN routing.

### 4. The token expired

If you took longer than 60 minutes from clicking "Add device" to configuring the device, the token may have expired. Click **Re-issue** in the dialog and try again.

### 5. The device is already paired to a different tenant

Each device's serial number can only be in one tenant. If the device was previously paired elsewhere and not properly removed, you'll need a super-admin to release the SN before pairing here.

### 6. The device shows a red database icon

This means it's TRYING to talk to a server but failing. Almost always a wrong Server Address or HTTPS setting. Re-check Step 3 values.

### 7. Power cycle

After saving Cloud Server settings, some devices need a full power cycle (not just the auto-reboot) before the first handshake. Pull power for 30 seconds, plug back in.

---

## After pairing — recommended next steps

1. **Set the timezone on the device menu** (Step 5 above) and verify the wall clock.
2. **Open the device in ZK Connect** → Settings tab. Adjust Display, Verify thresholds, etc. to your site's preference.
3. **Add some test members** (Sidebar → Members → Add). Enroll their biometrics on the device.
4. **Make a test punch** on the device. It should appear in **Attendance** within 5–10 seconds.

If anything looks wrong, the **Recent commands** card in the device's Settings tab shows the last 10 commands and their results.

---

## What this platform CAN and CAN'T do remotely

Once a device is paired, you can do all of this from the ZK Connect UI:

✅ Read network state (IP, gateway, DHCP status)  
✅ Adjust 28+ device settings (volume, brightness, biometric thresholds, lock duration, verify mode, …)  
✅ Add/remove/enroll members with biometric templates  
✅ Read attendance in real time  
✅ Reboot the device  
✅ Wipe attendance log / fingerprints / faces / palms / photos / admins  
✅ Factory reset  
✅ Pause / resume the device (stop accepting punches without unpairing)

Currently **NOT** remotely (until the LAN Agent ships in a later release):

❌ Set the wall-clock time on SpeedFace V5L (use device menu)  
❌ Change the IP / DHCP / Wi-Fi config (risk of bricking the LAN connection)  
❌ Trigger an audible test beep from the UI  
❌ Run shell-level diagnostics on the device

Customers running SpeedFace are most affected by these limits. Other firmwares (BioTime, iFace) generally accept the time-set remotely; the UI will show or hide buttons accordingly.
