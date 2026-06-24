---
name: machine-bsod-constraint
description: Lenovo IdeaPad BSODs caused by ISH.sys — fixed 2026-06-12; watch for recurrence
metadata: 
  node_type: memory
  type: user
  originSessionId: 9c068aa4-5366-42b6-b8f5-01e71bf2c4a0
---

The user's Lenovo IdeaPad Flex 5 14IRU8 (82Y0, "jameslenovo", Windows 11 Home build 26200, 15.6 GB RAM) BSODed on 2026-06-05 and 2026-06-12 during JGC build sessions. Bugcheck 0xD1, null-pointer write at DISPATCH_LEVEL; faulting module ISH.sys (Intel Integrated Sensor Solution v3.1.0.4596). Not caused by JGC code — likely thermally triggered during heavy builds (convertible form factor; ISH drives rotation/thermal sensors).

**Fix applied 2026-06-12:** Installed ISH driver 3.1.0.4599 (2024-12-15) from Microsoft Update Catalog (hardware ID `PCI\VEN_8086&DEV_51FC`, pnputil oem54.inf). VirtualBox 7.2.2 also uninstalled same day. Leftover VirtualBox user data at `C:\Users\jgord\VirtualBox VMs\Android` (not deleted).

**If it crashes again:** pull newest dump from `C:\Windows\Minidump`, run triage-dump parser. Verify current driver: `Get-CimInstance Win32_PnPSignedDriver -Filter "DeviceName LIKE '%Integrated Sensor%'"` — should be ≥ 3.1.0.4599.

**Note:** A BSOD on 2026-06-16 interrupted a major context-building session (junctioning test + project scope explanation). Session data was partially recovered across scattered project folders. See [[session-folder-confusion]].
