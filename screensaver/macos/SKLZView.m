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

static NSString *const kSaverURL = @"https://hermanosamini.com/?kiosk=1";
static const NSTimeInterval kRetry = 30.0;

/* Stamped by build.sh. It is in the status line for one specific reason:
   macOS keeps legacyScreenSaver.appex RESIDENT, and an Objective-C bundle
   cannot be unloaded, so a host started before you installed a new .saver
   keeps running the OLD code forever. Reinstalling looks like it did nothing.
   Printing the build makes a stale host obvious in one glance instead of
   costing a day of "but it works on my machine". */
#ifndef SKLZ_BUILD
#define SKLZ_BUILD "dev"
#endif

@interface SKLZView : ScreenSaverView <WKNavigationDelegate>
@property (nonatomic, strong) WKWebView *web;
@property (nonatomic, strong) NSTextField *statusLabel;   // ABOVE the web view
@property (nonatomic, strong) NSTimer *retryTimer;
@property (nonatomic, copy)   NSString *loadError;        // survives the paint poll
@property (nonatomic, assign) BOOL painted;
@end

@implementation SKLZView

- (instancetype)initWithFrame:(NSRect)frame isPreview:(BOOL)isPreview {
  if (!(self = [super initWithFrame:frame isPreview:isPreview])) return nil;
  self.animationTimeInterval = 1.0;          // the page animates itself
  self.wantsLayer = YES;
  self.layer.backgroundColor = NSColor.blackColor.CGColor;

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

  _web = [[WKWebView alloc] initWithFrame:self.bounds configuration:cfg];
  _web.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  _web.navigationDelegate = self;
  _web.wantsLayer = YES;
  /* Transparent, not black: if WebKit never presents a frame in the sandboxed
     screensaver host, a black web view would hide the status text behind an
     identical-looking black rectangle. Let the view's own layer show through
     until the art is confirmed drawing. */
  _web.layer.backgroundColor = NSColor.clearColor.CGColor;
  [_web setValue:@NO forKey:@"drawsBackground"];   // KVC: the API is private
  [self addSubview:_web];

  /* Added AFTER the web view, so it composites on top of it. */
  _statusLabel = [[NSTextField alloc] initWithFrame:
      NSMakeRect(24, 20, NSWidth(self.bounds) - 48, 22)];
  _statusLabel.autoresizingMask = NSViewWidthSizable | NSViewMaxYMargin;
  _statusLabel.bezeled = NO;
  _statusLabel.editable = NO;
  _statusLabel.selectable = NO;
  _statusLabel.drawsBackground = NO;
  _statusLabel.font = [NSFont monospacedSystemFontOfSize:13 weight:NSFontWeightRegular];
  _statusLabel.textColor = [NSColor colorWithCalibratedRed:1 green:0.70 blue:0.28 alpha:0.9];
  _statusLabel.stringValue = @"SKLZ " @SKLZ_BUILD @"  ·  starting";
  [self addSubview:_statusLabel];

  [self load];
  return self;
}

- (void)say:(NSString *)msg {
  /* AppKit from the main thread only; the JS completion handler is already on
     it, but the timer path is safer explicit than implicit. */
  dispatch_async(dispatch_get_main_queue(), ^{
    self.statusLabel.stringValue =
        [@"SKLZ " @SKLZ_BUILD @"  ·  " stringByAppendingString:msg];
  });
}

- (void)load {
  [self say:@"connecting to hermanosamini.com"];
  [self.web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:kSaverURL]]];
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
       "var d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;"
       "var n=0,l=0;for(var i=3;i<d.length;i+=1600){n++;if(d[i]>20)l++;}"
       "return (l>0? 'painting ':'canvas blank ')+Math.round(l/n*100)+'% t='+"
       "tv.toFixed(1)+gl2;"
       "}catch(e){return 'js error: '+e.message}})()";
  [self.web evaluateJavaScript:js completionHandler:^(id r, NSError *e) {
    NSString *s = e ? [@"probe failed: " stringByAppendingString:e.localizedDescription]
                    : [NSString stringWithFormat:@"%@", r];
    BOOL nowPainting = [s hasPrefix:@"painting"];
    /* A recorded load failure is the more useful message: without this, the
       poll's generic "no canvas" would bury the reason the page never came. */
    [self say:(!nowPainting && self.loadError) ? self.loadError : s];
    if (nowPainting != self.painted) {
      self.painted = nowPainting;
      /* Only hide the status once the art is genuinely on screen. */
      self.statusLabel.hidden = nowPainting;
    }
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
  self.statusLabel.hidden = NO;
  [self say:@"web process died, reloading"];
  [self load];
}

/* The engine calls this on animationTimeInterval. The page draws itself, so
   the only job here is to keep asking whether it really is. */
- (void)animateOneFrame {
  static int tick = 0;
  if ((tick++ % 2) == 0) [self pollPaint];
}

- (void)stopAnimation {
  [self.retryTimer invalidate];
  self.retryTimer = nil;
  [super stopAnimation];
}

- (void)drawRect:(NSRect)rect {
  [[NSColor blackColor] setFill];        // black behind everything
  NSRectFill(rect);
}

- (BOOL)hasConfigureSheet { return NO; }
- (NSWindow *)configureSheet { return nil; }

@end
