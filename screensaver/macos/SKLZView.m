/* SKLZ macOS screensaver: a WKWebView aimed at the living art.
 *
 * The page does all the work; ?kiosk=1 walks itself through the enter gate,
 * hides the chrome, and hides the cursor. This shell only has to survive the
 * two states a screensaver actually meets: no network (retry until it comes
 * back, black in the meantime) and the System Settings preview thumbnail.
 *
 * Built by screensaver/macos/build.sh; no Xcode project on purpose.
 */

#import <ScreenSaver/ScreenSaver.h>
#import <WebKit/WebKit.h>

static NSString *const kSaverURL = @"https://hermanosamini.com/?kiosk=1";
static const NSTimeInterval kRetry = 30.0;

@interface SKLZView : ScreenSaverView <WKNavigationDelegate>
@property (nonatomic, strong) WKWebView *web;
@property (nonatomic, strong) NSTimer *retryTimer;
/* Status is drawn NATIVELY, so a failure can never look like a blank screen.
   A screensaver that is simply black tells you nothing: page not loaded,
   loaded but not painting, and crashed all look identical. */
@property (nonatomic, copy) NSString *status;
@property (nonatomic, copy) NSString *loadError;   // survives the paint poll
@property (nonatomic, assign) BOOL painted;
@end

@implementation SKLZView

- (instancetype)initWithFrame:(NSRect)frame isPreview:(BOOL)isPreview {
  if (!(self = [super initWithFrame:frame isPreview:isPreview])) return nil;
  self.animationTimeInterval = 1.0;          // the page animates itself

  WKWebViewConfiguration *cfg = [WKWebViewConfiguration new];
  // ?kiosk=1 is silent, but leave autoplay open so ?kiosk=1&sound=1 works
  // for anyone who edits kSaverURL and rebuilds.
  cfg.mediaTypesRequiringUserActionForPlayback = WKAudiovisualMediaTypeNone;

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
  /* Layer-backed on purpose. The screensaver host composites through a remote
     layer tree; a non-layer-backed WKWebView can end up never presenting a
     frame there, which reads as a black screen with everything "working". */
  self.wantsLayer = YES;
  _web.wantsLayer = YES;
  _web.layer.backgroundColor = NSColor.blackColor.CGColor;
  _status = @"starting";
  [self addSubview:_web];
  [self load];
  return self;
}

- (void)load {
  self.status = @"connecting to hermanosamini.com";
  [self setNeedsDisplay:YES];
  [self.web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:kSaverURL]]];
}

/* Ask the page whether it is actually drawing, not merely loaded. Anything
   other than "painting" here is the answer to why the screen is black. */
- (void)pollPaint {
  NSString *js =
      @"(function(){try{"
       "var c=document.getElementById('hero');"
       "if(!c) return 'no canvas';"
       "var d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;"
       "var n=0,l=0;for(var i=3;i<d.length;i+=1600){n++;if(d[i]>20)l++;}"
       "return (l>0? 'painting ':'blank ')+Math.round(l/n*100)+'% t='+"
       "((typeof t!=='undefined')?t.toFixed(1):'?');"
       "}catch(e){return 'js error: '+e.message}})()";
  [self.web evaluateJavaScript:js completionHandler:^(id r, NSError *e) {
    NSString *s = e ? [@"probe failed: " stringByAppendingString:e.localizedDescription]
                    : [NSString stringWithFormat:@"%@", r];
    self.painted = [s hasPrefix:@"painting"];
    /* A recorded load failure is the more useful message: without this, the
       poll's generic "no canvas" would bury the reason the page never came. */
    self.status = (!self.painted && self.loadError) ? self.loadError : s;
    [self setNeedsDisplay:YES];
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
  self.status = self.loadError;
  [self setNeedsDisplay:YES];
  [self scheduleRetry];
}
- (void)webView:(WKWebView *)w didFailNavigation:(WKNavigation *)n
      withError:(NSError *)e {
  self.loadError = [@"navigation failed: " stringByAppendingString:e.localizedDescription];
  self.status = self.loadError;
  [self setNeedsDisplay:YES];
  [self scheduleRetry];
}
- (void)webView:(WKWebView *)w didFinishNavigation:(WKNavigation *)n {
  self.loadError = nil;                    // we got there; stale error is noise
  self.status = @"page loaded, waiting for first frame";
  [self setNeedsDisplay:YES];
}
// The GPU process can be killed under memory pressure; reload, don't die.
- (void)webViewWebContentProcessDidTerminate:(WKWebView *)w { [self load]; }

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
  [[NSColor blackColor] setFill];        // black until the page paints
  NSRectFill(rect);
  if (self.painted) return;              // art is up: get out of its way
  /* Until the art is confirmed painting, say so on screen. Silent black is
     the one outcome that teaches nobody anything. */
  NSDictionary *a = @{
    NSFontAttributeName: [NSFont monospacedSystemFontOfSize:13 weight:NSFontWeightRegular],
    NSForegroundColorAttributeName: [NSColor colorWithCalibratedRed:1 green:0.70 blue:0.28 alpha:0.85]
  };
  NSString *line = [NSString stringWithFormat:@"SKLZ  ·  %@", self.status ?: @"starting"];
  [line drawAtPoint:NSMakePoint(NSMinX(rect) + 24, NSMinY(rect) + 24) withAttributes:a];
}

- (BOOL)hasConfigureSheet { return NO; }
- (NSWindow *)configureSheet { return nil; }

@end
