/* SKLZ macOS screensaver: a WKWebView aimed at the living art.
 *
 * The page does all the work; ?kiosk=1 walks itself through the enter gate,
 * hides the chrome, and hides the cursor. This shell only has to survive the
 * states a screensaver actually meets: no network, a web process that never
 * paints, and the System Settings preview.
 *
 * Status is reported ON SCREEN, in a text layer that sits ABOVE the web view.
 * An earlier build drew the status in drawRect:, underneath an opaque
 * WKWebView, so every message it produced was invisible and every failure
 * looked like the same black rectangle. Diagnostics you cannot see are not
 * diagnostics.
 *
 * Built by screensaver/macos/build.sh; no Xcode project on purpose.
 */

#import <ScreenSaver/ScreenSaver.h>
#import <WebKit/WebKit.h>
#import <objc/message.h>

/* NOT renamed with the product (2026-08-28). This keys ScreenSaverDefaults,
   where the saver's mode and board live, so changing the string would orphan
   every existing install's settings silently: the sheet would come up blank
   and the display would revert to `live`. An internal key is not a label. */
static NSString *const kModule = @"com.hermanosamini.SKLZ";
static const NSTimeInterval kRetry = 30.0;

/* ── configuration ──
   Three modes, stored in ScreenSaverDefaults (the sanctioned per-saver
   defaults domain, shared across the per-display instances):
     mode 0  live art, the piece's default look
     mode 1  demo: the whole look rerolls every 3 minutes
     mode 2  a specific shared board, by short code (hermanosamini.com/AbC123)
             or a full share URL pasted straight in
   The URL is BUILT here rather than stored, so kiosk=1 can never be lost by
   an edited default: losing it strands the saver on the enter gate. */
static NSURL *saverURL(void) {
  ScreenSaverDefaults *d = [ScreenSaverDefaults defaultsForModuleWithName:kModule];
  NSInteger mode = [d integerForKey:@"mode"];
  NSString *code = [d stringForKey:@"board"] ?: @"";
  code = [code stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];

  NSString *base = @"https://hermanosamini.com/";
  NSString *query = @"?kiosk=1";
  if (mode == 1) query = @"?kiosk=1&demo=1";
  if (mode == 2 && code.length) {
    if ([code hasPrefix:@"http"]) {
      /* a pasted share link: keep its path AND its ?c= payload, add kiosk */
      NSURLComponents *u = [NSURLComponents componentsWithString:code];
      if (u) {
        NSMutableArray *items = [u.queryItems mutableCopy] ?: [NSMutableArray new];
        [items addObject:[NSURLQueryItem queryItemWithName:@"kiosk" value:@"1"]];
        u.queryItems = items;
        u.scheme = @"https"; u.host = @"hermanosamini.com";  // never elsewhere
        return u.URL;
      }
    } else {
      /* a bare short code: the site's own /AbC123 path resolves it */
      base = [base stringByAppendingString:
        [code stringByAddingPercentEncodingWithAllowedCharacters:
          NSCharacterSet.alphanumericCharacterSet]];
    }
  }
  return [NSURL URLWithString:[base stringByAppendingString:query]];
}

/* Stamped by build.sh. It is in the status line for one specific reason:
   macOS keeps legacyScreenSaver.appex RESIDENT, and an Objective-C bundle
   cannot be unloaded, so a host started before you installed a new .saver
   keeps running the OLD code forever. Reinstalling looks like it did nothing.
   Printing the build makes a stale host obvious in one glance instead of
   costing a day of "but it works on my machine". */
#ifndef SKLZ_BUILD
#define SKLZ_BUILD "dev"
#endif

/* What a human sees: the status line, and the preview window's title. The
   bundle filename and CFBundleName in Info.plist carry the same string; the
   identifiers around them (kModule, CFBundleIdentifier, NSPrincipalClass,
   the SKLZ_* page globals) are deliberately NOT renamed. */
#define NAME_ON_SCREEN "hermanosamini.com"
/* Seconds of not-painting before the status line is allowed on screen. Long
   enough that a slow first load never flashes it, short enough that a real
   black screen explains itself while somebody is still standing there. */
#define STATUS_GRACE 8.0

@interface SKLZView : ScreenSaverView <WKNavigationDelegate>
@property (nonatomic, strong) WKWebView *web;
@property (nonatomic, strong) NSTextField *statusLabel;   // ABOVE the web view
@property (nonatomic, strong) NSDate *shownAt;            // when this run started
@property (nonatomic, strong) NSTimer *retryTimer;
@property (nonatomic, copy)   NSString *loadError;        // survives the paint poll
@property (nonatomic, assign) BOOL painted;
@property (nonatomic, assign) NSInteger evalsInFlight;    // backpressure, see animateOneFrame
@property (nonatomic, assign) NSInteger tickCount;        // per-view, NOT a file static
@property (nonatomic, strong) NSWindow *sheet;
@property (nonatomic, strong) NSPopUpButton *modePop;
@property (nonatomic, strong) NSTextField *boardField;
@end

@implementation SKLZView

- (instancetype)initWithFrame:(NSRect)frame isPreview:(BOOL)isPreview {
  if (!(self = [super initWithFrame:frame isPreview:isPreview])) return nil;
  /* 30Hz, because THIS is the page's clock inside the screensaver host.
     legacyScreenSaver's WKWebView reports itself occluded, so the page's own
     requestAnimationFrame NEVER fires there: the page loads, boots, and then
     freezes on a black first frame forever. That was the entire
     "works in preview.sh, black in real Preview" mystery: preview.sh is a
     normal visible window where rAF runs. animateOneFrame now drives the
     page's SKLZ_TICK, which defers to rAF when rAF is alive and steps the
     frame itself when it is not. */
  self.animationTimeInterval = 1.0 / 30.0;
  self.wantsLayer = YES;
  self.layer.backgroundColor = NSColor.blackColor.CGColor;

  _statusLabel = [[NSTextField alloc] initWithFrame:
      NSMakeRect(24, 20, NSWidth(self.bounds) - 48, 22)];
  _statusLabel.autoresizingMask = NSViewWidthSizable | NSViewMaxYMargin;
  _statusLabel.bezeled = NO;
  _statusLabel.editable = NO;
  _statusLabel.selectable = NO;
  _statusLabel.drawsBackground = NO;
  _statusLabel.font = [NSFont monospacedSystemFontOfSize:13 weight:NSFontWeightRegular];
  _statusLabel.textColor = [NSColor colorWithCalibratedRed:1 green:0.70 blue:0.28 alpha:0.9];
  /* NAME_ON_SCREEN, not "SKLZ": this label is visible on a display and in
     Preview, so it says what the thing is called. The build stamp stays: it is
     the only way to spot the resident-host trap install.sh exists to defeat. */
  _statusLabel.stringValue = @NAME_ON_SCREEN @" " @SKLZ_BUILD @"  ·  starting";
  /* ── THE STATUS LINE IS NOT FURNITURE (2026-09-01) ──
     Pedram: "drop the text we write on the bottom left." It used to show
     during startup and again on stop, which is every normal run, and a
     screensaver should be the art and nothing else.

     The NSTextField STAYS, hidden, and that is deliberate three times over:
       - `lifecycle-test.sh` walks the view tree for it and FAILS the run if it
         cannot read "painting". Deleting the object breaks the test that
         proves the saver stops doing work when it leaves the screen.
       - `preview.sh` mirrors it into the terminal.
       - It is the only thing that tells SCRIPT DEAD from a stalled clock from
         NO-WEBGL. "The canvas is black" is equally true of all three, and
         telling them apart once cost a full day.
     `hidden` does not touch `stringValue`, so both tools keep working.

     It comes back ON SCREEN only if the art has failed to paint for
     STATUS_GRACE seconds, which is not a normal run by definition. A
     screensaver that goes black with no explanation is the exact failure this
     label was added for; silence there would trade a real diagnostic for
     nothing, since nobody is looking at a working saver's corner anyway. */
  _statusLabel.hidden = YES;
  _shownAt = [NSDate date];
  [self addSubview:_statusLabel];

  /* NOTHING is loaded here. See startAnimation. */
  return self;
}

/* ── the web view's whole life fits between startAnimation and stopAnimation ──
   It used to be built and loaded right here in the initialiser and never torn
   down, which is a real bug and not a stylistic one: legacyScreenSaver.appex
   stays RESIDENT after the screensaver leaves the screen, so the WKWebView it
   is holding stays resident too, with a live WebGL page and a live connection
   to hermanosamini.com behind it. Measured on 2026-08-22: one host up 2d23h
   had burned 28.3 CPU-hours across its four processes, about 40% of a
   performance core continuously, rendering frames to a screen nobody was
   looking at, with the WebKit GPU process grown to 1.6 GB resident.

   ScreenSaverView already provides exactly the two hooks this needs. The fix
   is to actually use them. */
- (void)buildWeb {
  if (self.web) return;

  WKWebViewConfiguration *cfg = [WKWebViewConfiguration new];
  /* A screensaver is silent. Requiring a user gesture for audible playback
     means the web view itself refuses to make noise, no matter what the page
     asks for: a second, independent lock on top of the page's own kiosk rule.
     Video is exempt so the canvas art is unaffected. Anyone who genuinely
     wants sound edits kSaverURL to add &sound=1 AND relaxes this line. */
  cfg.mediaTypesRequiringUserActionForPlayback = WKAudiovisualMediaTypeAudio;

  /* Ask for kiosk mode twice: once in the URL, once with a flag injected
     before any of the page's own script runs. The query alone is one redirect
     or one rewritten reload away from being lost, and losing it strands a
     screensaver on the enter-gate with nobody to click it. */
  WKUserScript *kiosk =
      [[WKUserScript alloc] initWithSource:@"window.SKLZ_KIOSK = 1;"
                             injectionTime:WKUserScriptInjectionTimeAtDocumentStart
                          forMainFrameOnly:YES];
  [cfg.userContentController addUserScript:kiosk];

  WKWebView *w = [[WKWebView alloc] initWithFrame:self.bounds configuration:cfg];
  w.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  w.navigationDelegate = self;
  w.wantsLayer = YES;
  /* Transparent, not black: if WebKit never presents a frame in the sandboxed
     screensaver host, a black web view would hide the status text behind an
     identical-looking black rectangle. Let the view's own layer show through
     until the art is confirmed drawing. */
  w.layer.backgroundColor = NSColor.clearColor.CGColor;
  [w setValue:@NO forKey:@"drawsBackground"];      // KVC: the API is private
  /* BELOW the status label, which was added first this time round, so the
     diagnostics still composite on top of the art. */
  [self addSubview:w positioned:NSWindowBelow relativeTo:self.statusLabel];
  self.web = w;
  /* A fresh web view owes us nothing: any evaluation outstanding against the
     old one will never call back, and its unpaid count would otherwise sit in
     the budget forever and throttle the new one to a standstill. */
  self.evalsInFlight = 0;
}

/* Tear the web view all the way down rather than merely hiding or pausing it.
   Hiding leaves the page's requestAnimationFrame loop running (WebKit's own
   occlusion signal is exactly what this host gets wrong, which is why
   animateOneFrame has to drive SKLZ_TICK by hand in the first place), and
   pausing leaves the WebContent, Networking and GPU XPC children alive. The
   only thing that reliably ends all four is releasing the view. */
- (void)teardownWeb {
  WKWebView *w = self.web;
  if (!w) return;
  self.web = nil;                        // before anything can call back in
  w.navigationDelegate = nil;
  [w stopLoading];
  [w loadHTMLString:@"" baseURL:nil];    // drop the page and its GL contexts
  [w removeFromSuperview];
  /* Releasing the web view is NOT what ends its web content process: measured,
     the trio outlived every reference we hold by more than a minute. `_close`
     is the one call that tears the process down at a known moment. It is SPI,
     so it is guarded rather than assumed: if a future WebKit drops it the
     saver keeps working and the shared pool above still caps the damage. */
  SEL closeSel = NSSelectorFromString(@"_close");
  if ([w respondsToSelector:closeSel]) {
    ((void (*)(id, SEL))objc_msgSend)(w, closeSel);
  }

  self.painted = NO;
  self.loadError = nil;
  self.evalsInFlight = 0;      // nothing outstanding can call back now
  /* stringValue only: the tests read it, and the screensaver has already left
     the screen so there is nobody to show it to. */
  self.statusLabel.hidden = YES;
  self.statusLabel.stringValue = @NAME_ON_SCREEN @" " @SKLZ_BUILD @"  ·  stopped";
}

- (void)startAnimation {
  [super startAnimation];        // this is what flips isAnimating to YES
  self.shownAt = [NSDate date];  // the grace clock runs from each start
  [self buildWeb];
  [self load];
}

/* ── NEVER DEPEND ON stopAnimation ALONE ──
   teardownWeb had exactly one caller, stopAnimation, so the entire cleanup
   path rested on the host politely announcing the end. A view that is simply
   DISCARDED (display reconfigured, host recycling its view, a preview torn
   down, the wallpaper/screensaver plumbing swapping instances) never gets that
   call, and on macOS Tahoe the screensaver is hosted by
   legacyScreenSaver (Wallpaper), which is resident: whatever it fails to
   release stays released-never.

   Leaving a window is the one event that always fires when a view stops being
   on screen, whoever discarded it and however impolitely. It is idempotent
   (teardownWeb returns immediately with no web view) and startAnimation
   rebuilds unconditionally, so a view that comes back gets a fresh page. */
- (void)viewDidMoveToWindow {
  [super viewDidMoveToWindow];
  if (self.window) return;               // added or moved: nothing to clean up
  /* The FULL shutdown, not just teardownWeb. Measured 2026-09-07: tearing the
     web view down here while leaving isAnimating YES still leaked all three
     WebKit processes, because ScreenSaverView's own animation machinery keeps
     running against a view it believes is live. Routing through stopAnimation
     is what makes a discarded view indistinguishable from a stopped one, which
     is the entire point. Guarded because stopAnimation on a view that never
     started is not a no-op worth risking. */
  if (self.isAnimating) { [self stopAnimation]; return; }
  [self.retryTimer invalidate];
  self.retryTimer = nil;
  [self teardownWeb];
}

- (void)dealloc {
  [_retryTimer invalidate];
  _retryTimer = nil;
  /* Last ditch, and deliberately the full teardown rather than the partial one
     this used to do. Releasing the view does release the web view eventually,
     but only once WebKit's own internal references clear; dropping the page
     here ends the WebGL context, the audio graph and the connection to
     hermanosamini.com at a known moment instead of an unknown one. */
  _web.navigationDelegate = nil;
  [_web stopLoading];
  [_web loadHTMLString:@"" baseURL:nil];
  [_web removeFromSuperview];
  _web = nil;
}

- (void)say:(NSString *)msg {
  /* AppKit from the main thread only; the JS completion handler is already on
     it, but the timer path is safer explicit than implicit. */
  dispatch_async(dispatch_get_main_queue(), ^{
    self.statusLabel.stringValue =
        [@NAME_ON_SCREEN @" " @SKLZ_BUILD @"  ·  " stringByAppendingString:msg];
  });
}

- (void)load {
  /* A retry timer, a dead web process, or the configure sheet can all reach
     this after the screensaver has left the screen. Refuse, or the teardown
     is undone by its own callbacks. */
  if (!self.isAnimating) return;
  [self buildWeb];
  [self say:@"connecting to hermanosamini.com"];
  [self.web loadRequest:[NSURLRequest requestWithURL:saverURL()]];
}

/* Ask the page whether it is actually drawing, not merely loaded. Anything
   other than "painting" here is the answer to why the screen is black. */
- (void)pollPaint {
  /* Report the CAUSE, not just the symptom. The old probe could only say
     "canvas blank", which is true of a dead script, a stalled render loop and
     a genuinely black frame alike. The three-monitor black-screen report cost
     a full investigation to distinguish, so the probe now answers them apart:

       script dead     -> the module threw; `t` never initialised
       loop stalled    -> `t` exists but is not advancing
       no webgl        -> context creation failed (three views, three contexts)

     `t` is a `let`, so `typeof t` THROWS rather than returning "undefined"
     inside its temporal dead zone. That is precisely the signal we want, so it
     is caught deliberately rather than guarded against. */
  NSString *js =
      @"(function(){try{"
       "var alive=true, tv=-1;"
       "try{ tv=t; }catch(e){ alive=false; }"
       "if(!alive) return 'SCRIPT DEAD (module threw before the render loop)';"
       "var c=document.getElementById('hero');"
       "if(!c) return 'no canvas yet';"
       "var gl2=(typeof HAS_GL!=='undefined')?(HAS_GL?'':' NO-WEBGL'):'';"
       /* Downscale, THEN read back. The old probe called getImageData over the
          WHOLE hero canvas to sample every 400th pixel: at DPR 2 on a 5K panel
          that copies ~59 MB from the GPU every two seconds, per view, to look
          at ~9,000 of them. That readback is synchronous inside the web
          content process, so it stalls the very process the next 60 SKLZ_TICK
          evaluations are queued against. blitting to 48x48 first answers the
          same question ("is anything lit") from a 9 KB buffer. */
       "var s=window.__sklzProbe||(window.__sklzProbe=document.createElement('canvas'));"
       "s.width=48;s.height=48;"
       "var sx=s.getContext('2d');sx.clearRect(0,0,48,48);sx.drawImage(c,0,0,48,48);"
       "var d=sx.getImageData(0,0,48,48).data;"
       "var n=0,l=0;for(var i=3;i<d.length;i+=4){n++;if(d[i]>20)l++;}"
       "return (l>0? 'painting ':'canvas blank ')+Math.round(l/n*100)+'% t='+"
       "tv.toFixed(1)+gl2;"
       "}catch(e){return 'js error: '+e.message}})()";
  /* ── THE COMPLETION HANDLER MUST NOT RETAIN self ──
     This block is owned by the WKWebView until the evaluation comes back. A
     strong `self` here therefore closes a cycle for the whole in-flight
     window: self -> web (strong property) -> pending block -> self. That is
     survivable when the callback always arrives, and it is a permanent leak
     when it does not, which is exactly what a saturated or wedged web content
     process produces.

     The consequence was measured on Pedram's machine on 2026-09-07: ~75 live
     "legacyScreenSaver (Wallpaper) Web Content" processes, one per screensaver
     engagement, none of them ever released. teardownWeb drops OUR reference to
     the web view, but a pending block holding self keeps the web view alive
     from the other side, and legacyScreenSaver.appex is resident, so nothing
     ever collects the pile. Weak here means a dropped callback costs one
     no-op, never a process. */
  __weak typeof(self) weakSelf = self;
  [self.web evaluateJavaScript:js completionHandler:^(id r, NSError *e) {
    typeof(self) self = weakSelf;
    if (!self) return;                 // view already gone: nothing to report
    NSString *s = e ? [@"probe failed: " stringByAppendingString:e.localizedDescription]
                    : [NSString stringWithFormat:@"%@", r];
    BOOL nowPainting = [s hasPrefix:@"painting"];
    /* A recorded load failure is the more useful message: without this, the
       poll's generic "no canvas" would bury the reason the page never came. */
    [self say:(!nowPainting && self.loadError) ? self.loadError : s];
    self.painted = nowPainting;
    /* Hidden while painting, and hidden while NOT painting until the grace
       period is up. Evaluated every poll rather than only on transition: the
       stuck case never transitions, which is precisely the case that needs to
       speak up. */
    BOOL stuck = !nowPainting &&
        (-[self.shownAt timeIntervalSinceNow] > STATUS_GRACE);
    self.statusLabel.hidden = !stuck;
  }];
}

- (void)scheduleRetry {
  [self.retryTimer invalidate];
  self.retryTimer = [NSTimer scheduledTimerWithTimeInterval:kRetry
                                                     target:self
                                                   selector:@selector(load)
                                                   userInfo:nil
                                                    repeats:NO];
}

// Offline, DNS failure, captive portal: keep the screen black and try again.
- (void)webView:(WKWebView *)w didFailProvisionalNavigation:(WKNavigation *)n
      withError:(NSError *)e {
  self.loadError = [@"load failed: " stringByAppendingString:e.localizedDescription];
  [self say:self.loadError];
  [self scheduleRetry];
}
- (void)webView:(WKWebView *)w didFailNavigation:(WKNavigation *)n
      withError:(NSError *)e {
  self.loadError = [@"navigation failed: " stringByAppendingString:e.localizedDescription];
  [self say:self.loadError];
  [self scheduleRetry];
}
- (void)webView:(WKWebView *)w didFinishNavigation:(WKNavigation *)n {
  self.loadError = nil;                    // we got there; a stale error is noise
  [self say:@"page loaded, waiting for first frame"];
}
/* The web content process dying is the classic cause of a black web view in a
   sandboxed host. Say so rather than silently reloading forever. */
- (void)webViewWebContentProcessDidTerminate:(WKWebView *)w {
  self.painted = NO;
  /* Every evaluation queued against the dead process is unpayable. */
  self.evalsInFlight = 0;
  /* A crash-and-reload usually recovers inside a second. Restart the grace
     clock rather than flashing text for a blip; if the reload does not take,
     the poll above surfaces it after STATUS_GRACE. */
  self.shownAt = [NSDate date];
  self.statusLabel.hidden = YES;
  if (!self.isAnimating) return;         // it died because we killed it
  [self say:@"web process died, reloading"];
  [self load];
}

/* The engine calls this on animationTimeInterval. The page draws itself, so
   the only job here is to keep asking whether it really is. */
- (void)animateOneFrame {
  if (!self.isAnimating || !self.web) return;
  /* ── BACKPRESSURE: NEVER PILE WORK ONTO A STALLED WEB PROCESS ──
     This fires 30 times a second and each call is a real XPC round trip into
     the web content process. With no accounting, a process that is busy (or
     wedged) still gets 30 more evaluations queued every second, forever, and
     each one holds its own completion state. That is how a saver that is
     merely slow becomes a saver that is eating the machine.

     `tick` was also a FILE STATIC, so on a multi-display setup every view
     shared one counter and the paint poll landed on whichever view happened to
     hit the modulus. It is per-view now. */
  if (self.evalsInFlight < 4) {
    self.evalsInFlight++;
    __weak typeof(self) weakSelf = self;
    [self.web evaluateJavaScript:@"window.SKLZ_TICK && SKLZ_TICK()"
               completionHandler:^(id r, NSError *e) {
      typeof(self) self = weakSelf;
      if (self && self.evalsInFlight > 0) self.evalsInFlight--;
    }];
  }
  if ((self.tickCount++ % 60) == 0) [self pollPaint];
}

- (void)stopAnimation {
  [super stopAnimation];         // isAnimating goes NO here, and it must go
                                 // first: releasing the web view kills the
                                 // WebContent process, which fires the
                                 // did-terminate delegate, whose entire job is
                                 // to reload. The flag is what stops it.
  [self.retryTimer invalidate];
  self.retryTimer = nil;
  [self teardownWeb];
}

- (void)drawRect:(NSRect)rect {
  [[NSColor blackColor] setFill];        // black behind everything
  NSRectFill(rect);
}

/* ── the configure sheet ──
   Built in code because this project has no Xcode project and no xib on
   purpose. Three choices and a text field; everything else stays the page's
   business. */
- (BOOL)hasConfigureSheet { return YES; }

- (NSWindow *)configureSheet {
  if (self.sheet) return self.sheet;

  NSWindow *w = [[NSWindow alloc]
      initWithContentRect:NSMakeRect(0, 0, 440, 190)
                styleMask:NSWindowStyleMaskTitled
                  backing:NSBackingStoreBuffered
                    defer:YES];
  w.title = @NAME_ON_SCREEN;
  NSView *v = w.contentView;

  NSTextField *label = [NSTextField labelWithString:@"What should the screensaver show?"];
  label.frame = NSMakeRect(20, 148, 400, 20);
  [v addSubview:label];

  self.modePop = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(20, 114, 400, 26) pullsDown:NO];
  [self.modePop addItemsWithTitles:@[
      @"The living art (its current look)",
      @"Demo mode: a whole new look every 3 minutes",
      @"A specific board (short code or share link)"]];
  [self.modePop setTarget:self];
  [self.modePop setAction:@selector(modeChanged:)];
  [v addSubview:self.modePop];

  self.boardField = [[NSTextField alloc] initWithFrame:NSMakeRect(20, 78, 400, 24)];
  self.boardField.placeholderString = @"FdqPpZ  or  https://hermanosamini.com/FdqPpZ";
  [v addSubview:self.boardField];

  NSTextField *hint = [NSTextField labelWithString:
      @"Boards come from the piece: dress the skull, hit \u201ccopy a link\u201d, paste it here."];
  hint.frame = NSMakeRect(20, 54, 400, 18);
  hint.font = [NSFont systemFontOfSize:11];
  hint.textColor = NSColor.secondaryLabelColor;
  [v addSubview:hint];

  NSButton *ok = [NSButton buttonWithTitle:@"Save" target:self action:@selector(sheetSave:)];
  ok.frame = NSMakeRect(340, 14, 80, 30);
  ok.keyEquivalent = @"\r";
  [v addSubview:ok];
  NSButton *cancel = [NSButton buttonWithTitle:@"Cancel" target:self action:@selector(sheetCancel:)];
  cancel.frame = NSMakeRect(252, 14, 84, 30);
  [v addSubview:cancel];

  ScreenSaverDefaults *d = [ScreenSaverDefaults defaultsForModuleWithName:kModule];
  [self.modePop selectItemAtIndex:MIN(2, MAX(0, [d integerForKey:@"mode"]))];
  self.boardField.stringValue = [d stringForKey:@"board"] ?: @"";
  [self modeChanged:nil];

  self.sheet = w;
  return w;
}

- (void)modeChanged:(id)sender {
  BOOL board = self.modePop.indexOfSelectedItem == 2;
  self.boardField.enabled = board;
  self.boardField.textColor = board ? NSColor.labelColor : NSColor.disabledControlTextColor;
}

- (void)sheetSave:(id)sender {
  ScreenSaverDefaults *d = [ScreenSaverDefaults defaultsForModuleWithName:kModule];
  [d setInteger:self.modePop.indexOfSelectedItem forKey:@"mode"];
  [d setObject:self.boardField.stringValue forKey:@"board"];
  [d synchronize];
  [NSApp endSheet:self.sheet];
  [self.sheet orderOut:nil];
  [self load];                       // apply immediately, not on next launch
}

- (void)sheetCancel:(id)sender {
  [NSApp endSheet:self.sheet];
  [self.sheet orderOut:nil];
}

@end
