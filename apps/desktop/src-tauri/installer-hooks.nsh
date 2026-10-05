; SPDX-License-Identifier: MPL-2.0
; Project data is not disposable application cache. Even a silent uninstall or
; an upgrade must retain it. A future explicit in-app data management flow can
; handle user-requested removal separately.
!macro NSIS_HOOK_PREUNINSTALL
  StrCpy $DeleteAppDataCheckboxState 0
!macroend
