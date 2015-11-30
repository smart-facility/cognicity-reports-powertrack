'use strict';

/* jshint -W079 */ // Ignore this error for this import only, as we get a redefinition problem
var test = require('unit.js');
/* jshint +W079 */
var PowertrackDataSource = require('../PowertrackDataSource');

// Mock reports
var reports = {
	logger: {},
	tweetAdmin: function(){}
};

// Create server with empty objects
// We will mock these objects as required for each test suite
var powertrackDataSource = new PowertrackDataSource(
	reports,
	{}
);

// Mocked logger we can use to let code run without error when trying to call logger messages
powertrackDataSource.logger = {
	error:function(){},
	warn:function(){},
	info:function(){},
	verbose:function(){},
	debug:function(){}
};
powertrackDataSource.reports.logger = powertrackDataSource.logger;

// Test harness for CognicityReportsPowertrack object
describe( 'PowertrackDataSource', function() {

	// Test suite for i18n getMessage function
	describe( '_getMessage', function() {
		// Setup by adding some codes and a defaultLanguage to the config
		before( function() {
			powertrackDataSource.config = {
				'twitter' : {
					'greeting' : {
						'human' : 'hi',
						'monkey' : 'eek'
					},
					'defaultLanguage' : 'human'
				}
			};
		});

		// Create a dummy tweet activity object based on the language codes passed in
		function createTweetActivity(lang1, lang2) {
			var tweetActivity = {};
			if (lang1) tweetActivity.twitter_lang = lang1;
			if (lang2) tweetActivity.gnip = {
				language: {
					value: lang2
				}
			};
			return tweetActivity;
		}

		it( 'Should resolve a string for twitter language code', function() {
			test.string( powertrackDataSource._getMessage( 'greeting', createTweetActivity('human') ) ).is( 'hi' );
		});
		it( 'Should resolve a string for Gnip language code', function() {
			test.string( powertrackDataSource._getMessage( 'greeting', createTweetActivity(null,'monkey') ) ).is( 'eek' );
		});
		it( 'Should resolve twitter code if both twitter and Gnip codes present', function() {
			test.string( powertrackDataSource._getMessage( 'greeting', createTweetActivity('monkey','human') ) ).is( 'eek' );
		});
		it( 'Should resolve a string for default language', function() {
			test.string( powertrackDataSource._getMessage( 'greeting', createTweetActivity('cat') ) ).is( 'hi' );
		});
		it( 'Should return null if code cannot be resolved', function() {
			test.value( powertrackDataSource._getMessage( 'farewell', createTweetActivity('human') ) ).is( null );
		});
	});

	// Test suite for filter function
	describe( 'filter', function() {
		// The strings we look for in the log messages
		var confirmedString = "= confirmed report";
		var askForGeoString = "= ask user for geo";
		var unconfirmedString = "= unconfirmed";
		var askToParticipateString = "= ask user to participate";
		var noMatchString = "Tweet did not match";

		// Create a dummy tweetActivity object matching the criteria we specified
		function createTweetActivity(boundingbox, geo, addressed, location) {
			var tweetActivity = {
				gnip : {
					matching_rules : []
				},
				actor : {
					preferredUsername : "a"
				},
				body : "b"
			};

			if (boundingbox) tweetActivity.gnip.matching_rules.push( {tag:"boundingbox"} );
			if (addressed) tweetActivity.gnip.matching_rules.push( {tag:"addressed"} );
			if (location) tweetActivity.gnip.matching_rules.push( {tag:"location"} );
			if (geo) tweetActivity.geo = {
				coordinates: [1,2]
			};

			return tweetActivity;
		}

		// Retain references to functions on the server which we're going to mock out for
		// testing and then re-connect after the test suite
		var oldLogger;
		var oldInsertConfirmed;
		var oldInsertNonSpatial;
		var oldinsertUnConfirmed;
		var oldinsertInvitee;
		var oldSendReplyTweet;
		var oldGetMessage;
		var oldIfNewUser;

		// Store the last message we logged; this lets us do some neat testing of code paths
		var lastLog = "";

		before( function() {
			// Mock logging functions to store the log message so we can inspect it
			oldLogger = powertrackDataSource.logger;
			powertrackDataSource.logger = {
				error:function(msg){ lastLog = msg; },
				warn:function(msg){ lastLog = msg; },
				info:function(msg){ lastLog = msg; },
				verbose:function(msg){ lastLog = msg; },
				debug:function(msg){ lastLog = msg; }
			};

			// Retain functions we're going to mock out
			oldInsertConfirmed = powertrackDataSource._insertConfirmed;
			oldInsertNonSpatial = powertrackDataSource._insertNonSpatial;
			oldinsertUnConfirmed = powertrackDataSource._insertUnConfirmed;
			oldinsertInvitee = powertrackDataSource._insertInvitee;
			oldSendReplyTweet = powertrackDataSource._sendReplyTweet;
			oldGetMessage = powertrackDataSource._getMessage;
			oldIfNewUser = powertrackDataSource._ifNewUser;

			// Mock these methods as we will look at the log message to check the code path
			powertrackDataSource._insertConfirmed = function(){};
			powertrackDataSource._insertNonSpatial = function(){};
			powertrackDataSource._insertUnConfirmed = function(){};
			powertrackDataSource._insertInvitee = function(){};
			powertrackDataSource._sendReplyTweet = function(){};
			powertrackDataSource._getMessage = function(){};
			powertrackDataSource._ifNewUser = function(){};
		});

		// Test all the variants of the 4 true/false categorization switches

		// Location T/F
		it( '+BOUNDINGBOX +GEO +ADDRESSED +LOCATION = confirmed', function() {
			powertrackDataSource.filter( createTweetActivity(true, true, true, true) );
			test.value( lastLog ).contains( confirmedString );
		});
		it( '+BOUNDINGBOX +GEO +ADDRESSED -LOCATION = confirmed', function() {
			powertrackDataSource.filter( createTweetActivity(true, true, true, false) );
			test.value( lastLog ).contains( confirmedString );
		});

		// Addressed F + above
		it( '+BOUNDINGBOX +GEO -ADDRESSED +LOCATION = unconfirmed', function() {
			powertrackDataSource.filter( createTweetActivity(true, true, false, true) );
			test.value( lastLog ).contains( unconfirmedString );
		});
		it( '+BOUNDINGBOX +GEO -ADDRESSED -LOCATION = unconfirmed', function() {
			powertrackDataSource.filter( createTweetActivity(true, true, false, false) );
			test.value( lastLog ).contains( unconfirmedString );
		});

		// Geo F + above
		// Note that +BOUNDINGBOX -GEO means that BOUNDINGBOX is set to false in our
		// filter code, as a BOUNDINGBOX hit without explicit tweet GEO is not enough
		// - so these actually fall in to filter cases like '-BOUNDINGBOX -GEO ...'
		it( '+BOUNDINGBOX -GEO +ADDRESSED +LOCATION = ask for geo', function() {
			powertrackDataSource.filter( createTweetActivity(true, false, true, true) );
			test.value( lastLog ).contains( askForGeoString );
		});
		it( '+BOUNDINGBOX -GEO +ADDRESSED -LOCATION = no match', function() {
			powertrackDataSource.filter( createTweetActivity(true, false, true, false) );
			test.value( lastLog ).contains( noMatchString );
		});
		it( '+BOUNDINGBOX -GEO -ADDRESSED +LOCATION = ask to participate', function() {
			powertrackDataSource.filter( createTweetActivity(true, false, false, true) );
			test.value( lastLog ).contains( askToParticipateString );
		});
		it( '+BOUNDINGBOX -GEO -ADDRESSED -LOCATION = no match', function() {
			powertrackDataSource.filter( createTweetActivity(true, false, false, false) );
			test.value( lastLog ).contains( noMatchString );
		});

		// Boundingbox F + above
		it( '-BOUNDINGBOX +GEO +ADDRESSED +LOCATION = no match', function() {
			powertrackDataSource.filter( createTweetActivity(false, true, true, true) );
			test.value( lastLog ).contains( noMatchString );
		});
		it( '-BOUNDINGBOX +GEO +ADDRESSED -LOCATION = no match', function() {
			powertrackDataSource.filter( createTweetActivity(false, true, true, false) );
			test.value( lastLog ).contains( noMatchString );
		});
		it( '-BOUNDINGBOX +GEO -ADDRESSED +LOCATION = no match', function() {
			powertrackDataSource.filter( createTweetActivity(false, true, false, true) );
			test.value( lastLog ).contains( noMatchString );
		});
		it( '-BOUNDINGBOX +GEO -ADDRESSED -LOCATION = no match', function() {
			powertrackDataSource.filter( createTweetActivity(false, true, false, false) );
			test.value( lastLog ).contains( noMatchString );
		});
		it( '-BOUNDINGBOX -GEO +ADDRESSED +LOCATION = ask for geo', function() {
			powertrackDataSource.filter( createTweetActivity(false, false, true, true) );
			test.value( lastLog ).contains( askForGeoString );
		});
		it( '-BOUNDINGBOX -GEO +ADDRESSED -LOCATION = no match', function() {
			powertrackDataSource.filter( createTweetActivity(false, false, true, false) );
			test.value( lastLog ).contains( noMatchString );
		});
		it( '-BOUNDINGBOX -GEO -ADDRESSED +LOCATION = ask to participate', function() {
			powertrackDataSource.filter( createTweetActivity(false, false, false, true) );
			test.value( lastLog ).contains( askToParticipateString );
		});
		it( '-BOUNDINGBOX -GEO -ADDRESSED -LOCATION = no match', function() {
			powertrackDataSource.filter( createTweetActivity(false, false, false, false) );
			test.value( lastLog ).contains( noMatchString );
		});

		// Restore/erase mocked functions
		after( function() {
			powertrackDataSource.logger = oldLogger;
			powertrackDataSource._insertConfirmed = oldInsertConfirmed;
			powertrackDataSource._insertNonSpatial = oldInsertNonSpatial;
			powertrackDataSource._insertUnConfirmed = oldinsertUnConfirmed;
			powertrackDataSource._insertInvitee = oldinsertInvitee;
			powertrackDataSource._sendReplyTweet = oldSendReplyTweet;
			powertrackDataSource._getMessage = oldGetMessage;
			powertrackDataSource._ifNewUser = oldIfNewUser;
		});
	});

	// Test suite for start
	describe( 'start', function() {
		var streamStarted; // Counter for number of times Gnip.Stream.start was called
		var lastDelay; // The last delay passed to setTimeout
		var reconnectTimes; // Number of times to attempt to reconnect (so the test does not go on forever)
		var streamErrorHandler; // Capture the error handler so we can call it with no delay
		var streamReadyHandler; // Capture the ready handler so we can call it explicitly during test
		var notifiedTimes; // Number of times twitter notification was sent
		var oldTweetAdmin; // Save old tweetAdmin function
		var oldSetTimeout; // Capture global setTimeout so we can mock it

		before( function() {
			powertrackDataSource.Gnip = {
				Stream: function() {
					return {
						start: function(){
							// For the specified number of times, increment the counter and call the error handler immediately
							if (streamStarted<reconnectTimes) {
								streamStarted++;
								streamErrorHandler();
							}
						},
						// Mock the Socket object with no-ops
						_req: {
							setTimeout: function(){},
							destroy: function(){}
						},
						// Capture the error handler so we can call it immediately
						on: function( event, callback ) {
							if (event==='error') streamErrorHandler = callback;
							else if (event==='ready') streamReadyHandler = callback;
						}
					};
				},
				// Mock the rules object and just call the callback immediately
				Rules: function() {
					return {
						live: {
							update: function(rules, success){ success(); }
						}
					};
				}
			};
			// Capture the number of times we send a message via twitter
			powertrackDataSource.reports.tweetAdmin = function() {
				notifiedTimes++;
			};
			// Store the global setTimeout
			oldSetTimeout = setTimeout;
			// Mock setTimeout with one which captures the delay and calls the callback immediately
			/* jshint -W020 */ // We want to mock out a global function here
			setTimeout = function( callback, delay ) {
				lastDelay = delay;
				callback();
			};
			/* jshint +W020 */
		});

		beforeEach( function() {
			// Setup object for Gnip configuration
			powertrackDataSource.config.gnip = {};

			// Reset the counters and handler references
			streamStarted = 0;
			lastDelay = 0;
			streamErrorHandler = null;
			notifiedTimes = 0;
		});

		it( 'Reconnection time increases exponentially', function() {
			powertrackDataSource.config.gnip.maxReconnectTimeout = 10000;
			reconnectTimes = 3;
			powertrackDataSource.start(); // Will get connection errors only
			test.value( streamStarted ).is( 3 ); // Expect stream tried to conenct 3 times
			test.value( lastDelay ).is( 4 * 1000 ); // So 4 second reconnect; delays of 1, 2, 4
		});

		it( 'Reconnection time is capped at maximum setting', function() {
			powertrackDataSource.config.gnip.maxReconnectTimeout = 3000;
			reconnectTimes = 4;
			powertrackDataSource.start(); // Will get connection errors only
			test.value( streamStarted ).is( 4 ); // Expect stream tried to connect 4 times
			test.value( lastDelay ).is( 3 * 1000 ); // Expect 3 second reconnect, delays of 1, 2, 3, 3
		});

		it( 'Reconnection notification tweet is only sent once', function() {
			powertrackDataSource.config.gnip.maxReconnectTimeout = 1000;
			reconnectTimes = 3;
			powertrackDataSource.reports.config = {
				adminTwitterUsernames: "astro"
			};
			powertrackDataSource.start(); // Will get connection errors only
			test.value( streamStarted ).is( 3 ); // Expect stream tried to reconnect 3 times
			test.value( notifiedTimes ).is( 1 ); // Expect that we only notified the user once
		});

		it( 'Reconnection notification tweet is sent again if reconnected between disconnections', function() {
			powertrackDataSource.config.gnip.maxReconnectTimeout = 1000;
			reconnectTimes = 2;
			powertrackDataSource.reports.config = {
				adminTwitterUsernames: "astro"
			};
			powertrackDataSource.start(); // Will get connection errors only
			streamReadyHandler(); // We reconnected to the stream
			streamErrorHandler(); // And we were disconnected again
			test.value( notifiedTimes ).is( 2 ); // Expect that we notified the user twice
		});

		after( function() {
			/* jshint -W020 */ // We want to mock out a global function here
			setTimeout = oldSetTimeout;
			/* jshint +W020 */
			powertrackDataSource.Gnip = {};
			powertrackDataSource.reports.config = {};
			powertrackDataSource.reports.twitter = {};
			powertrackDataSource.config = {};
			powertrackDataSource.tweetAdmin = oldTweetAdmin;
		});

	});

	describe( "sendReplyTweet", function() {
		var successCallbackRan;
		var updateStatusRan;
		var updateStatusParams;
		var tweetId = "5377776775";

		function createTweetActivity(username) {
			return {
				id : 'tag:search.twitter.com,2005:'+tweetId,
				actor: {
					preferredUsername: username
				}
			};
		}
		function success(){
			successCallbackRan = true;
		}
		var message = 'pan galactic gargle blaster';

		before( function() {
			powertrackDataSource.reports.twitter = {
				updateStatus: function(message,params,callback) {
					updateStatusRan = true;
					updateStatusParams = params;
					callback( powertrackDataSource.reports.twitter.tweetSendWillError, {} );
				}
			};
			powertrackDataSource.config = {
				twitter: {
					usernameReplyBlacklist : 'zaphod, ford,arthur'
				}
			};
		});

		beforeEach( function() {
			powertrackDataSource.reports.twitter.tweetSendWillError = false;
			powertrackDataSource.config.twitter.send_enabled = true;
			successCallbackRan = false;
			updateStatusRan = false;
			updateStatusParams = {};
		});

		it( "sendReplyTweet calls updateStatus and executes callback", function() {
			powertrackDataSource._sendReplyTweet( createTweetActivity('trillian'), message, false, success );
			test.value( successCallbackRan ).is( true );
			test.value( updateStatusRan ).is( true );
		});


		it( "Tweet not sent to usernames in usernameReplyBlacklist", function() {
			powertrackDataSource._sendReplyTweet( createTweetActivity('zaphod'), message, false, success );
			test.value( successCallbackRan ).is( false );

			powertrackDataSource._sendReplyTweet( createTweetActivity('ford'), message, false, success );
			test.value( successCallbackRan ).is( false );

			powertrackDataSource._sendReplyTweet( createTweetActivity('arthur'), message, false, success );
			test.value( successCallbackRan ).is( false );
		});

		it( 'Tweet not sent if send_enabled is false', function() {
			powertrackDataSource.config.twitter.send_enabled = false;
			powertrackDataSource._sendReplyTweet( createTweetActivity('trillian'), message, false, success );
			test.value( updateStatusRan ).is( false );
		});

		it( 'Callback executed if send_enabled is false', function() {
			powertrackDataSource.config.twitter.send_enabled = false;
			powertrackDataSource._sendReplyTweet( createTweetActivity('trillian'), message, false, success );
			test.value( successCallbackRan ).is( true );
		});

		it( 'Callback not executed if error tweeting occurs', function() {
			powertrackDataSource.reports.twitter.tweetSendWillError = true;
			powertrackDataSource._sendReplyTweet( createTweetActivity('trillian'), message, false, success );
			test.value( successCallbackRan ).is( false );
		});

		it( 'Tweet is reply to ID from tweetActivity', function() {
			powertrackDataSource._sendReplyTweet( createTweetActivity('trillian'), message, false, success );
			test.value( updateStatusParams.in_reply_to_status_id ).is( tweetId );
		});

		after( function(){
			powertrackDataSource.reports.twitter = {};
			powertrackDataSource.config = {};
		});
	});

	describe( "cacheMode", function() {
		var streamTweetHandler; // Capture the tweet handler so we can call it explicitly during test
		var oldFilter; // Capture server filter method
		var tweetActivity = {actor:'ripley'};

		var filterCalledTimes;

		before( function() {
			powertrackDataSource.config.gnip = {};
			powertrackDataSource.Gnip = {
				Stream: function() {
					return {
						start: function(){},
						// Capture the error handler so we can call it immediately
						on: function( event, callback ) {
							if (event==='tweet') streamTweetHandler = callback;
						}
					};
				},
				// Mock the rules object and just call the callback immediately
				Rules: function() {
					return {
						live: {
							update: function(rules, success){ success(); }
						}
					};
				}
			};
			oldFilter = powertrackDataSource.filter;
			powertrackDataSource.filter = function(){ filterCalledTimes++; };
		});

		beforeEach( function() {
			filterCalledTimes = 0;
			powertrackDataSource._cachedData = [];
			powertrackDataSource._cacheMode = false;
		});

		it( 'Realtime processing is enabled by default', function() {
			powertrackDataSource.start(); // Start processing stream
			streamTweetHandler(tweetActivity); // Simulate incoming tweet
			test.value( filterCalledTimes ).is( 1 );
			test.value( powertrackDataSource._cachedData.length ).is( 0 );
		});

		it( 'Enabling caching mode stops realtime filtering and retains tweets', function() {
			powertrackDataSource.start(); // Start processing stream
			powertrackDataSource.enableCacheMode(); // Start cache mode
			streamTweetHandler(tweetActivity); // Simulate incoming tweet
			test.value( filterCalledTimes ).is( 0 );
			test.value( powertrackDataSource._cachedData.length ).is( 1 );
		});

		it( 'Disabling caching mode reenables realtime filtering', function() {
			powertrackDataSource.start(); // Start processing stream
			powertrackDataSource.enableCacheMode(); // Start cache mode
			powertrackDataSource.disableCacheMode(); // Stop cache mode
			streamTweetHandler(tweetActivity); // Simulate incoming tweet
			test.value( filterCalledTimes ).is( 1 );
			test.value( powertrackDataSource._cachedData.length ).is( 0 );
		});

		it( 'Cached tweets are processed when caching mode is disabled', function() {
			powertrackDataSource.start(); // Start processing stream
			powertrackDataSource.enableCacheMode(); // Start cache mode
			streamTweetHandler(tweetActivity); // Simulate incoming tweet
			test.value( filterCalledTimes ).is( 0 );
			test.value( powertrackDataSource._cachedData.length ).is( 1 );
			powertrackDataSource.disableCacheMode(); // Stop cache mode
			test.value( filterCalledTimes ).is( 1 );
			test.value( powertrackDataSource._cachedData.length ).is( 0 );
		});

		it( 'Multiple tweet handling', function() {
			powertrackDataSource.start(); // Start processing stream
			streamTweetHandler(tweetActivity); // Simulate incoming tweet
			streamTweetHandler(tweetActivity); // Simulate incoming tweet
			test.value( filterCalledTimes ).is( 2 );
			test.value( powertrackDataSource._cachedData.length ).is( 0 );
			powertrackDataSource.enableCacheMode(); // Start cache mode
			streamTweetHandler(tweetActivity); // Simulate incoming tweet
			streamTweetHandler(tweetActivity); // Simulate incoming tweet
			streamTweetHandler(tweetActivity); // Simulate incoming tweet
			test.value( filterCalledTimes ).is( 2 );
			test.value( powertrackDataSource._cachedData.length ).is( 3 );
			powertrackDataSource.disableCacheMode(); // Stop cache mode
			test.value( filterCalledTimes ).is( 5 );
			test.value( powertrackDataSource._cachedData.length ).is( 0 );
		});

		// Restore/erase mocked functions
		after( function(){
			powertrackDataSource.filter = oldFilter;
		});

	});

	describe( "constructor", function() {

		it( 'Config is merged from reports with data source', function() {
			var pds = new PowertrackDataSource(
				{
					config: {
						jupiter: "europa"
					}
				},
				{
					saturn: "enceladus"
				}
			);

			test.value( pds.config.jupiter ).is( 'europa' );
			test.value( pds.config.saturn ).is( 'enceladus' );
		});

	});

	// TODO _ifNewUser
	// TODO _insertConfirmed
	// TODO _insertInvitee
	// TODO _insertUnConfirmed
	// TODO _insertNonSpatial

// Test template
//	describe( "suite", function() {
//		before( function() {
//		});
//
//		beforeEach( function() {
//		});
//
//		it( 'case', function() {
//		});
//
//		after( function(){
//		});
//	});

});
