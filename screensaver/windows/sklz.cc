/* SKLZ Windows screensaver: a WebView2 window aimed at the living art.
 *
 * A .scr is an ordinary exe that honors three flags:
 *   /s        run the saver (what Windows calls on idle)
 *   /c        show settings (we have none; say so)
 *   /p <hwnd> paint a live preview in the Settings dialog (we skip it:
 *             spinning up a browser for a postage stamp is rude)
 *
 * The page (https://hermanosamini.com/?kiosk=1) walks through its own enter
 * gate, hides its chrome, and hides the cursor. This shell provides the
 * three things a web page cannot: a borderless topmost window covering the
 * whole virtual desktop, exit-on-input via low-level hooks (a real
 * screensaver dies on the first keypress even if the webview has focus),
 * and a clear error if the WebView2 runtime is missing.
 *
 * Built by build.sh with mingw-w64; vendor headers are fetched, not
 * committed (webview 0.12.0 MIT + Microsoft WebView2 SDK).
 */

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstdlib>
#include <cstring>
#include "webview/webview.h"

static const char *kUrl = "https://hermanosamini.com/?kiosk=1";

static webview_t g_w = nullptr;
static bool g_closing = false;
static POINT g_first = {LONG_MIN, LONG_MIN};

static void bail() {
  if (!g_closing && g_w) { g_closing = true; webview_terminate(g_w); }
}

static LRESULT CALLBACK kb_hook(int code, WPARAM wp, LPARAM lp) {
  if (code == HC_ACTION && (wp == WM_KEYDOWN || wp == WM_SYSKEYDOWN)) bail();
  return CallNextHookEx(nullptr, code, wp, lp);
}

static LRESULT CALLBACK ms_hook(int code, WPARAM wp, LPARAM lp) {
  if (code == HC_ACTION) {
    if (wp == WM_LBUTTONDOWN || wp == WM_RBUTTONDOWN ||
        wp == WM_MBUTTONDOWN || wp == WM_MOUSEWHEEL) {
      bail();
    } else if (wp == WM_MOUSEMOVE) {
      // Ignore the sensor jitter that woke no one; die on a real move.
      const MSLLHOOKSTRUCT *m = reinterpret_cast<MSLLHOOKSTRUCT *>(lp);
      if (g_first.x == LONG_MIN) {
        g_first = m->pt;
      } else if (labs(m->pt.x - g_first.x) > 8 || labs(m->pt.y - g_first.y) > 8) {
        bail();
      }
    }
  }
  return CallNextHookEx(nullptr, code, wp, lp);
}

int WINAPI WinMain(HINSTANCE, HINSTANCE, LPSTR cmd, int) {
  // Flags arrive as "/s", "/S", "/c", "/c:1234", "/p 1234". No flag means
  // the user opened the .scr directly: the spec says that is "configure".
  char mode = 'c';
  for (const char *p = cmd; p && *p; ++p) {
    if (*p == '/' && (p[1] == 's' || p[1] == 'S')) mode = 's';
    if (*p == '/' && (p[1] == 'p' || p[1] == 'P')) mode = 'p';
  }
  if (mode == 'p') return 0;
  if (mode == 'c') {
    MessageBoxA(nullptr,
                "SKLZ - Ritmos de los Muertos\n"
                "Una obra viva de los Hermanos Amini.\n\n"
                "No settings here: the art is at https://hermanosamini.com\n"
                "(the screensaver runs the same living page, silently).",
                "SKLZ", MB_OK | MB_ICONINFORMATION);
    return 0;
  }

  g_w = webview_create(0, nullptr);
  if (!g_w) {
    MessageBoxA(nullptr,
                "SKLZ needs the Microsoft WebView2 runtime\n"
                "(preinstalled on Windows 11 and updated Windows 10).\n\n"
                "Get it: https://developer.microsoft.com/microsoft-edge/webview2/",
                "SKLZ", MB_OK | MB_ICONERROR);
    return 1;
  }

  HWND h = static_cast<HWND>(webview_get_window(g_w));
  SetWindowLongPtr(h, GWL_STYLE, WS_POPUP | WS_VISIBLE);
  SetWindowLongPtr(h, GWL_EXSTYLE, WS_EX_TOPMOST | WS_EX_TOOLWINDOW);
  SetWindowPos(h, HWND_TOPMOST,
               GetSystemMetrics(SM_XVIRTUALSCREEN),
               GetSystemMetrics(SM_YVIRTUALSCREEN),
               GetSystemMetrics(SM_CXVIRTUALSCREEN),
               GetSystemMetrics(SM_CYVIRTUALSCREEN),
               SWP_SHOWWINDOW | SWP_FRAMECHANGED);

  // Low-level hooks see input before the webview does, so exit works even
  // with the browser focused. They need this thread's message pump, which
  // webview_run provides.
  HHOOK kb = SetWindowsHookExA(WH_KEYBOARD_LL, kb_hook, GetModuleHandle(nullptr), 0);
  HHOOK ms = SetWindowsHookExA(WH_MOUSE_LL, ms_hook, GetModuleHandle(nullptr), 0);

  /* Same belt-and-braces as the macOS shell: the URL asks for kiosk mode and
     so does this script, which runs before the page's own code. A lost query
     string would otherwise strand the screensaver on the enter gate. */
  webview_init(g_w, "window.SKLZ_KIOSK = 1;");
  webview_navigate(g_w, kUrl);
  webview_run(g_w);

  if (kb) UnhookWindowsHookEx(kb);
  if (ms) UnhookWindowsHookEx(ms);
  webview_destroy(g_w);
  return 0;
}
