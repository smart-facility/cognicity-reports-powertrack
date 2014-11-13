'use strict';

/* jshint node:true */
/* jshint unused:vars */ // We want to keep function parameters on callbacks like the originals
/* jshint curly:false */ // Don't require curly brackets around one-line statements

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

// Test harness for CognicityReportsPowertrack object
describe( 'CognicityReportsPowertrack', function() {
	
	// Test suite for i18n getMessage function
	describe( 'i18n', function() {
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
			// Mock logging calls to do nothing
			server.logger = {
				warn:function(){}
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
		
		// Restore/erase mocked functions
		after( function() {
			server.logger = {};
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
			server.insertConfirmed = oldInsertConfirmed;
			server.insertNonSpatial = oldInsertNonSpatial;
			server.insertUnConfirmed = oldinsertUnConfirmed;
			server.insertInvitee = oldinsertInvitee;
			server.sendReplyTweet = oldSendReplyTweet;
			server.getMessage = oldGetMessage;
			server.ifNewUser = oldIfNewUser;
			
			server.logger = {};
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
			// Mock log methods
			server.logger = {
				debug:function(){},
				error:function(){}
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
			server.logger = {};
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
			// Mock logging functions with no-ops
			server.logger = {
				error:function(){},
				warn:function(){},
				info:function(){},
				debug:function(){}
			};
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
			// Reset the config which the tests may change
			server.config = {
				gnip: {
					sendTweetOnMaxTimeoutTo: 'astro'
				}	
			};

			// Reset the counters and handler references
			streamStarted = 0;
			lastDelay = 0;
			streamErrorHandler = null;
			notifiedTimes = 0;
		});
		
		it( 'Reconnection time increases exponentially', function() {
			server.config.gnip.initialStreamReconnectTimeout = 1;
			server.config.gnip.maxReconnectTimeout = 10;
			reconnectTimes = 3;
			server.connectStream(); // Will get connection errors only
			test.value( streamStarted ).is( 3 ); // Expect stream tried to conenct 3 times
			test.value( lastDelay ).is( 4 * 1000 ); // So 4 second reconnect; delays of 1, 2, 4
		});

		it( 'Reconnection time is capped at maximum setting', function() {
			server.config.gnip.initialStreamReconnectTimeout = 1;
			server.config.gnip.maxReconnectTimeout = 3;
			reconnectTimes = 4;
			server.connectStream(); // Will get connection errors only
			test.value( streamStarted ).is( 4 ); // Expect stream tried to connect 4 times
			test.value( lastDelay ).is( 3 * 1000 ); // Expect 3 second reconnect, delays of 1, 2, 3, 3
		});

		it( 'Reconnection notification tweet is only sent once', function() {
			server.config.gnip.initialStreamReconnectTimeout = 1;
			server.config.gnip.maxReconnectTimeout = 1;
			reconnectTimes = 3;
			server.connectStream(); // Will get connection errors only
			test.value( streamStarted ).is( 3 ); // Expect stream tried to reconnect 3 times
			test.value( notifiedTimes ).is( 1 ); // Expect that we only notified the user once
		});

		it( 'Reconnection notification tweet is sent again if reconnected between disconnections', function() {
			server.config.gnip.initialStreamReconnectTimeout = 1;
			server.config.gnip.maxReconnectTimeout = 1;
			reconnectTimes = 2;
			server.connectStream(); // Will get connection errors only
			streamReadyHandler(); // We reconnected to the stream
			streamErrorHandler(); // And we were disconnected again
			test.value( notifiedTimes ).is( 2 ); // Expect that we notified the user twice
		});

		after( function() {
			server.logger = {};
			/* jshint -W020 */ // We want to mock out a global function here
			setTimeout = oldSetTimeout;
			/* jshint +W020 */
			server.Gnip = {};
			server.twit = {};
		});

	});
	
});