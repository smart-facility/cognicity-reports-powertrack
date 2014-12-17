'use strict';

/* jshint -W079 */ // Ignore this error for this import only, as we get a redefinition problem
var test = require('unit.js');
/* jshint +W079 */
var CognicityReportsPowertrack = require('../CognicityReportsPowertrack.js');

// Create server with empty objects
// We will mock these objects as required for each test suite
var server = new CognicityReportsPowertrack(
	{},
	{},
	{},
	{},
	{}
);

// Mocked logger we can use to let code run without error when trying to call logger messages
server.logger = {
	error:function(){},
	warn:function(){},
	info:function(){},
	verbose:function(){},
	debug:function(){}
};

// Test harness for CognicityReportsPowertrack object
describe( 'CognicityReportsPowertrack', function() {
	
	// Test suite for i18n getMessage function
	describe( 'getMessage', function() {
		// Setup by adding some codes and a defaultLanguage to the config
		before( function() {
			server.config = {
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
			test.string( server.getMessage( 'greeting', createTweetActivity('human') ) ).is( 'hi' );
		});
		it( 'Should resolve a string for Gnip language code', function() {
			test.string( server.getMessage( 'greeting', createTweetActivity(null,'monkey') ) ).is( 'eek' );
		});
		it( 'Should resolve twitter code if both twitter and Gnip codes present', function() {
			test.string( server.getMessage( 'greeting', createTweetActivity('monkey','human') ) ).is( 'eek' );
		});
		it( 'Should resolve a string for default language', function() {
			test.string( server.getMessage( 'greeting', createTweetActivity('cat') ) ).is( 'hi' );
		});
		it( 'Should return null if code cannot be resolved', function() {
			test.value( server.getMessage( 'farewell', createTweetActivity('human') ) ).is( null );
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
			oldLogger = server.logger;
			server.logger = {
				error:function(msg){ lastLog = msg; },
				warn:function(msg){ lastLog = msg; },
				info:function(msg){ lastLog = msg; },
				verbose:function(msg){ lastLog = msg; },
				debug:function(msg){ lastLog = msg; }
			};
			
			// Retain functions we're going to mock out
			oldInsertConfirmed = server.insertConfirmed;
			oldInsertNonSpatial = server.insertNonSpatial;
			oldinsertUnConfirmed = server.insertUnConfirmed;
			oldinsertInvitee = server.insertInvitee;
			oldSendReplyTweet = server.sendReplyTweet;
			oldGetMessage = server.getMessage;
			oldIfNewUser = server.ifNewUser;
			
			// Mock these methods as we will look at the log message to check the code path
			server.insertConfirmed = function(){};
			server.insertNonSpatial = function(){};
			server.insertUnConfirmed = function(){};
			server.insertInvitee = function(){};
			server.sendReplyTweet = function(){};
			server.getMessage = function(){};
			server.ifNewUser = function(){};
		});
		
		// Test all the variants of the 4 true/false categorization switches
		
		// Location T/F
		it( '+BOUNDINGBOX +GEO +ADDRESSED +LOCATION = confirmed', function() {
			server.filter( createTweetActivity(true, true, true, true) );
			test.value( lastLog ).contains( confirmedString );
		});
		it( '+BOUNDINGBOX +GEO +ADDRESSED -LOCATION = confirmed', function() {
			server.filter( createTweetActivity(true, true, true, false) );
			test.value( lastLog ).contains( confirmedString );
		});
		
		// Addressed F + above
		it( '+BOUNDINGBOX +GEO -ADDRESSED +LOCATION = unconfirmed', function() {
			server.filter( createTweetActivity(true, true, false, true) );
			test.value( lastLog ).contains( unconfirmedString );
		});
		it( '+BOUNDINGBOX +GEO -ADDRESSED -LOCATION = unconfirmed', function() {
			server.filter( createTweetActivity(true, true, false, false) );
			test.value( lastLog ).contains( unconfirmedString );
		});
		
		// Geo F + above
		// Note that +BOUNDINGBOX -GEO means that BOUNDINGBOX is set to false in our
		// filter code, as a BOUNDINGBOX hit without explicit tweet GEO is not enough
		// - so these actually fall in to filter cases like '-BOUNDINGBOX -GEO ...'
		it( '+BOUNDINGBOX -GEO +ADDRESSED +LOCATION = ask for geo', function() {
			server.filter( createTweetActivity(true, false, true, true) );
			test.value( lastLog ).contains( askForGeoString );
		});
		it( '+BOUNDINGBOX -GEO +ADDRESSED -LOCATION = no match', function() {
			server.filter( createTweetActivity(true, false, true, false) );
			test.value( lastLog ).contains( noMatchString );
		});
		it( '+BOUNDINGBOX -GEO -ADDRESSED +LOCATION = ask to participate', function() {
			server.filter( createTweetActivity(true, false, false, true) );
			test.value( lastLog ).contains( askToParticipateString );
		});
		it( '+BOUNDINGBOX -GEO -ADDRESSED -LOCATION = no match', function() {
			server.filter( createTweetActivity(true, false, false, false) );
			test.value( lastLog ).contains( noMatchString );
		});
		
		// Boundingbox F + above
		it( '-BOUNDINGBOX +GEO +ADDRESSED +LOCATION = no match', function() {
			server.filter( createTweetActivity(false, true, true, true) );
			test.value( lastLog ).contains( noMatchString );
		});
		it( '-BOUNDINGBOX +GEO +ADDRESSED -LOCATION = no match', function() {
			server.filter( createTweetActivity(false, true, true, false) );
			test.value( lastLog ).contains( noMatchString );
		});
		it( '-BOUNDINGBOX +GEO -ADDRESSED +LOCATION = no match', function() {
			server.filter( createTweetActivity(false, true, false, true) );
			test.value( lastLog ).contains( noMatchString );
		});
		it( '-BOUNDINGBOX +GEO -ADDRESSED -LOCATION = no match', function() {
			server.filter( createTweetActivity(false, true, false, false) );
			test.value( lastLog ).contains( noMatchString );
		});
		it( '-BOUNDINGBOX -GEO +ADDRESSED +LOCATION = ask for geo', function() {
			server.filter( createTweetActivity(false, false, true, true) );
			test.value( lastLog ).contains( askForGeoString );
		});
		it( '-BOUNDINGBOX -GEO +ADDRESSED -LOCATION = no match', function() {
			server.filter( createTweetActivity(false, false, true, false) );
			test.value( lastLog ).contains( noMatchString );
		});
		it( '-BOUNDINGBOX -GEO -ADDRESSED +LOCATION = ask to participate', function() {
			server.filter( createTweetActivity(false, false, false, true) );
			test.value( lastLog ).contains( askToParticipateString );
		});
		it( '-BOUNDINGBOX -GEO -ADDRESSED -LOCATION = no match', function() {
			server.filter( createTweetActivity(false, false, false, false) );
			test.value( lastLog ).contains( noMatchString );
		});
		
		// Restore/erase mocked functions
		after( function() {
			server.logger = oldLogger;
			server.insertConfirmed = oldInsertConfirmed;
			server.insertNonSpatial = oldInsertNonSpatial;
			server.insertUnConfirmed = oldinsertUnConfirmed;
			server.insertInvitee = oldinsertInvitee;
			server.sendReplyTweet = oldSendReplyTweet;
			server.getMessage = oldGetMessage;
			server.ifNewUser = oldIfNewUser;			
		});
	});
	
	// Test suite for dbQuery function
	describe( 'dbQuery', function() {
		before( function() {
			// Mock required parts of the PG config
			server.config = {
				'pg' : {
					'conString' : ''
				}
			};
		});
		
		// Setup a success handler which just flags whether it was run or not
		var successful = false;
		var successHandler = function(result) {
			successful = true;
		};
		
		beforeEach( function(){
			// Reset our success handler state
			successful = false;
			
			// Mock the PG object to let us set error states
			// Mock the connect and query methods to just pass through their arguments
			server.pg = {
				connectionErr: null,
				connectionClient: {
					query: function(config, handler) {
						handler(server.pg.queryErr, server.pg.queryResult);
					}
				},
				connectionDone: function(){},
				queryErr: null,
				queryResult: null,
				connect : function(config, success) {
					success(server.pg.connectionErr, server.pg.connectionClient, server.pg.connectionDone);
				}
			};
		});

		it( 'Connection error does not run success handler', function() {
			server.pg.connectionErr = true;
			server.dbQuery("", successHandler);
			test.value( successful ).isFalse();
		});
		it( 'Query error does not run success handler', function() {
			server.pg.queryErr = true;
			server.dbQuery("", successHandler);
			test.value( successful ).isFalse();
		});
		it( 'No error does run success handler', function() {
			server.dbQuery("", successHandler);
			test.value( successful ).isTrue();
		});
		
		// Restore/erase mocked functions
		after( function(){
			server.config = {};
			server.pg = {};
		});
	});
	
	// Test suite for connectStream
	describe( 'connectStream', function() {
		var streamStarted; // Counter for number of times Gnip.Stream.start was called
		var lastDelay; // The last delay passed to setTimeout
		var reconnectTimes; // Number of times to attempt to reconnect (so the test does not go on forever)
		var streamErrorHandler; // Capture the error handler so we can call it with no delay
		var streamReadyHandler; // Capture the ready handler so we can call it explicitly during test
		var notifiedTimes; // Number of times twitter notification was sent
		
		var oldSetTimeout; // Capture global setTimeout so we can mock it 
		
		before( function() {
			server.Gnip = {
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
			server.twit = {
				updateStatus: function() { notifiedTimes++; }	
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
			server.config.gnip = {};
			
			// Reset the counters and handler references
			streamStarted = 0;
			lastDelay = 0;
			streamErrorHandler = null;
			notifiedTimes = 0;
		});
		
		it( 'Reconnection time increases exponentially', function() {
			server.config.gnip.maxReconnectTimeout = 10000;
			reconnectTimes = 3;
			server.connectStream(); // Will get connection errors only
			test.value( streamStarted ).is( 3 ); // Expect stream tried to conenct 3 times
			test.value( lastDelay ).is( 4 * 1000 ); // So 4 second reconnect; delays of 1, 2, 4
		});

		it( 'Reconnection time is capped at maximum setting', function() {
			server.config.gnip.maxReconnectTimeout = 3000;
			reconnectTimes = 4;
			server.connectStream(); // Will get connection errors only
			test.value( streamStarted ).is( 4 ); // Expect stream tried to connect 4 times
			test.value( lastDelay ).is( 3 * 1000 ); // Expect 3 second reconnect, delays of 1, 2, 3, 3
		});

		it( 'Reconnection notification tweet is only sent once', function() {
			server.config.gnip.maxReconnectTimeout = 1000;
			reconnectTimes = 3;
			server.config.adminTwitterUsernames = "astro";
			server.connectStream(); // Will get connection errors only
			test.value( streamStarted ).is( 3 ); // Expect stream tried to reconnect 3 times
			test.value( notifiedTimes ).is( 1 ); // Expect that we only notified the user once
		});

		it( 'Reconnection notification tweet is sent again if reconnected between disconnections', function() {
			server.config.gnip.maxReconnectTimeout = 1000;
			reconnectTimes = 2;
			server.config.adminTwitterUsernames = "astro";
			server.connectStream(); // Will get connection errors only
			streamReadyHandler(); // We reconnected to the stream
			streamErrorHandler(); // And we were disconnected again
			test.value( notifiedTimes ).is( 2 ); // Expect that we notified the user twice
		});

		after( function() {
			/* jshint -W020 */ // We want to mock out a global function here
			setTimeout = oldSetTimeout;
			/* jshint +W020 */
			server.Gnip = {};
			server.twit = {};
			server.config = {};
		});

	});
	
	describe( "tweetAdmin", function() {
		var message = 'princess is in another castle';
		
		var notifiedTimes; // Number of times twitter notification was sent

		before( function() {			
			// Capture the number of times we send a message via twitter
			server.twit = {
				updateStatus: function() { notifiedTimes++; }	
			};
		});
		
		beforeEach( function() {
			// Reset capture variables
			notifiedTimes = 0;
		});
		
		it( 'No usernames does not send tweets', function() {
			server.config.adminTwitterUsernames = undefined;
			server.tweetAdmin( message );
			server.config.adminTwitterUsernames = null;
			server.tweetAdmin( message );
			server.config.adminTwitterUsernames = '';
			server.tweetAdmin( message );
			test.value( notifiedTimes ).is ( 0 );
		});
		
		it( 'Notification tweet is sent to a single user', function() {
			server.config.adminTwitterUsernames = "mario";
			server.tweetAdmin( message );
			test.value( notifiedTimes ).is ( 1 );
		});
		
		it( 'Notification tweet is sent to multiple users', function() {
			server.config.adminTwitterUsernames = "mario, peach";
			server.tweetAdmin( message );
			test.value( notifiedTimes ).is ( 2 );
		});
		
		// Restore/erase mocked functions
		after( function(){
			server.config = {};
			server.twit = {};
		});
		
	});
	
	describe( "cacheMode", function() {
		var streamTweetHandler; // Capture the tweet handler so we can call it explicitly during test
		var oldFilter; // Capture server filter method
		var tweetActivity = {actor:'ripley'};
		
		var filterCalledTimes;
		
		before( function() {	
			server.config.gnip = {};
			server.Gnip = {
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
			oldFilter = server.filter;
			server.filter = function(){ filterCalledTimes++; };
		});
		
		beforeEach( function() {
			filterCalledTimes = 0;
			server._cachedTweets = [];
			server._cacheMode = false;
		});
		
		it( 'Realtime processing is enabled by default', function() {
			server.connectStream(); // Start processing stream
			streamTweetHandler(tweetActivity); // Simulate incoming tweet
			test.value( filterCalledTimes ).is( 1 );
			test.value( server._cachedTweets.length ).is( 0 );
		});

		it( 'Enabling caching mode stops realtime filtering and retains tweets', function() {
			server.connectStream(); // Start processing stream
			server.enableCacheMode(); // Start cache mode
			streamTweetHandler(tweetActivity); // Simulate incoming tweet
			test.value( filterCalledTimes ).is( 0 );
			test.value( server._cachedTweets.length ).is( 1 );
		});
		
		it( 'Disabling caching mode reenables realtime filtering', function() {
			server.connectStream(); // Start processing stream
			server.enableCacheMode(); // Start cache mode
			server.disableCacheMode(); // Stop cache mode
			streamTweetHandler(tweetActivity); // Simulate incoming tweet
			test.value( filterCalledTimes ).is( 1 );
			test.value( server._cachedTweets.length ).is( 0 );
		});

		it( 'Cached tweets are processed when caching mode is disabled', function() {
			server.connectStream(); // Start processing stream
			server.enableCacheMode(); // Start cache mode
			streamTweetHandler(tweetActivity); // Simulate incoming tweet
			test.value( filterCalledTimes ).is( 0 );
			test.value( server._cachedTweets.length ).is( 1 );
			server.disableCacheMode(); // Stop cache mode
			test.value( filterCalledTimes ).is( 1 );
			test.value( server._cachedTweets.length ).is( 0 );
		});

		it( 'Multiple tweet handling', function() {
			server.connectStream(); // Start processing stream
			streamTweetHandler(tweetActivity); // Simulate incoming tweet
			streamTweetHandler(tweetActivity); // Simulate incoming tweet
			test.value( filterCalledTimes ).is( 2 );
			test.value( server._cachedTweets.length ).is( 0 );
			server.enableCacheMode(); // Start cache mode
			streamTweetHandler(tweetActivity); // Simulate incoming tweet
			streamTweetHandler(tweetActivity); // Simulate incoming tweet
			streamTweetHandler(tweetActivity); // Simulate incoming tweet
			test.value( filterCalledTimes ).is( 2 );
			test.value( server._cachedTweets.length ).is( 3 );
			server.disableCacheMode(); // Stop cache mode
			test.value( filterCalledTimes ).is( 5 );
			test.value( server._cachedTweets.length ).is( 0 );
		});

		// Restore/erase mocked functions
		after( function(){
			server.filter = oldFilter;
			server.config = {};
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
			server.twit = {
				updateStatus: function(message,params,callback) {
					updateStatusRan = true;
					updateStatusParams = params;
					callback( server.twit.tweetSendWillError, {} );
				}	
			};
			server.config = {
				twitter: {
					senderUsername : 'zaphod'
				}	
			};
		});
		
		beforeEach( function() {
			server.twit.tweetSendWillError = false;
			server.config.twitter.send_enabled = true;
			successCallbackRan = false;
			updateStatusRan = false;
			updateStatusParams = {};
		});
		
		it( "sendReplyTweet calls updateStatus and executes callback", function() {
			server.sendReplyTweet( createTweetActivity('trillian'), message, success );
			test.value( successCallbackRan ).is( true );
			test.value( updateStatusRan ).is( true );
		});

		
		it( "Tweet not sent to senderUsername", function() {
			server.sendReplyTweet( createTweetActivity('zaphod'), message, success );
			test.value( successCallbackRan ).is( false );
		});

		it( 'Tweet not sent if send_enabled is false', function() {
			server.config.twitter.send_enabled = false;
			server.sendReplyTweet( createTweetActivity('trillian'), message, success );
			test.value( updateStatusRan ).is( false );
		});

		it( 'Callback executed if send_enabled is false', function() {
			server.config.twitter.send_enabled = false;
			server.sendReplyTweet( createTweetActivity('trillian'), message, success );
			test.value( successCallbackRan ).is( true );
		});

		it( 'Callback not executed if error tweeting occurs', function() {
			server.twit.tweetSendWillError = true;
			server.sendReplyTweet( createTweetActivity('trillian'), message, success );
			test.value( successCallbackRan ).is( false );
		});

		it( 'Tweet is reply to ID from tweetActivity', function() {
			server.sendReplyTweet( createTweetActivity('trillian'), message, success );
			test.value( updateStatusParams.in_reply_to_status_id ).is( tweetId );
		});

		after( function(){
			server.twit = {};
			server.config = {};
		});
	});

	describe( "areTweetMessageLengthsOk", function() {
		function createString(length) {
			var s = "";
			for (var i = 0; i<length; i++) {
				s += "a";
			}
			return s;
		}
		
		before( function() {
		});
		
		beforeEach( function() {
			server.config = {
				twitter: {}	
			};
		});
		
		it( 'Non-object properties are not tested', function() {
			server.config.twitter = {
				singleProperty : createString(200)
			};
			
			test.value( server.areTweetMessageLengthsOk() ).is( true );
		});

		it( 'Single short message is ok', function() {
			server.config.twitter = {
				messageObject : {
					'en' : createString(1)
				}
			};
			test.value( server.areTweetMessageLengthsOk() ).is( true );
		});

		it( 'Single long message is not ok', function() {
			server.config.twitter = {
				messageObject : {
					'en' : createString(124)
				}
			};
			test.value( server.areTweetMessageLengthsOk() ).is( false );
		});

		it( 'Message over timestamp boundary is ok when timestamp is off', function() {
			server.config.twitter = {
				messageObject : {
					'en' : createString(120)
				},
				addTimestamp : false
			};
			test.value( server.areTweetMessageLengthsOk() ).is( true );
		});

		it( 'Message over timestamp boundary is not ok when timestamp is on', function() {
			server.config.twitter = {
				messageObject : {
					'en' : createString(120)
				},
				addTimestamp : true
			};
			test.value( server.areTweetMessageLengthsOk() ).is( false );
		});

		it( 'Multiple short messages are ok', function() {
			server.config.twitter = {
				messageObject1 : {
					'en' : createString(100),
					'fr' : createString(100)
				},
				messageObject2 : {
					'en' : createString(100),
					'fr' : createString(100)
				}
			};
			test.value( server.areTweetMessageLengthsOk() ).is( true );
		});

		it( 'Long message and multiple short messages are not ok', function() {
			server.config.twitter = {
				messageObject1 : {
					'en' : createString(100),
					'fr' : createString(100)
				},
				messageObject2 : {
					'en' : createString(100),
					'fr' : createString(200)
				}
			};
			test.value( server.areTweetMessageLengthsOk() ).is( false );
		});

		after( function(){
			server.config = {};
		});
	});
	
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