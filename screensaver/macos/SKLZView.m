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
@end

@implementation SKLZView

- (instancetype)initWithFrame:(NSRect)frame isPreview:(BOOL)isPreview {
  if (!(self = [super initWithFrame:frame isPreview:isPreview])) return nil;
  self.animationTimeInterval = 1.0;          // the page animates itself

  WKWebViewConfiguration *cfg = [WKWebViewConfiguration new];
  // ?kiosk=1 is silent, but leave autoplay open so ?kiosk=1&sound=1 works
  // for anyone who edits kSaverURL and rebuilds.
  cfg.mediaTypesRequiringUserActionForPlayback = WKAudiovisualMediaTypeNone;

  _web = [[WKWebView alloc] initWithFrame:self.bounds configuration:cfg];
  _web.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  _web.navigationDelegate = self;
  [self addSubview:_web];
  [self load];
  return self;
}

- (void)load {
  [self.web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:kSaverURL]]];
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
      withError:(NSError *)e { [self scheduleRetry]; }
- (void)webView:(WKWebView *)w didFailNavigation:(WKNavigation *)n
      withError:(NSError *)e { [self scheduleRetry]; }
// The GPU process can be killed under memory pressure; reload, don't die.
- (void)webViewWebContentProcessDidTerminate:(WKWebView *)w { [self load]; }

- (void)stopAnimation {
  [self.retryTimer invalidate];
  self.retryTimer = nil;
  [super stopAnimation];
}

- (void)drawRect:(NSRect)rect {
  [[NSColor blackColor] setFill];        // black until the page paints
  NSRectFill(rect);
}

- (BOOL)hasConfigureSheet { return NO; }
- (NSWindow *)configureSheet { return nil; }

@end
