'use strict';

/* jshint node:true */
/* jshint unused:vars */ // We want to keep function parameters on callbacks like the originals
/* jshint curly:false */ // Don't require curly brackets around one-line statements

/* jshint -W079 */
var test = require('unit.js');
/* jshint +W079 */
var CognicityReportsPowertrack = require('../CognicityReportsPowertrack.js');

// Create server with empty objects
// We will mock these objects as required for each test suite
var server = new CognicityReportsPowertrack(
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
					'foo' : {
						'az' : 'bar',
						'en' : 'gum'
					},
					'defaultLanguage' : 'en'
				}
			};
			// Mock logging calls to do nothing
			server.logger = {
				warn:function(){}
			};
		});
		
		it( 'Should resolve a string for specified language', function() {
			test.string( server.getMessage('foo', 'az') ).is( 'bar' );
		});
		it( 'Should resolve a string for default language', function() {
			test.string( server.getMessage('foo', 'does-not-exist') ).is( 'gum' );
		});
		it( 'Should return null if code cannot be resolved', function() {
			test.value( server.getMessage('does-not-exist', 'en') ).is( null );
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
			
			// Mock these methods as we will look at the log message to check the code path
			server.insertConfirmed = function(){};
			server.insertNonSpatial = function(){};
			server.insertUnConfirmed = function(){};
			server.insertInvitee = function(){};
			server.sendReplyTweet = function(){};
			server.getMessage = function(){};
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
		it( '+BOUNDINGBOX -GEO +ADDRESSED +LOCATION = confirmed', function() {
			server.filter( createTweetActivity(true, false, true, true) );
			test.value( lastLog ).contains( confirmedString );
		});
		it( '+BOUNDINGBOX -GEO +ADDRESSED -LOCATION = confirmed', function() {
			server.filter( createTweetActivity(true, false, true, false) );
			test.value( lastLog ).contains( confirmedString );
		});
		it( '+BOUNDINGBOX -GEO -ADDRESSED +LOCATION = unconfirmed', function() {
			server.filter( createTweetActivity(true, false, false, true) );
			test.value( lastLog ).contains( unconfirmedString );
		});
		it( '+BOUNDINGBOX -GEO -ADDRESSED -LOCATION = unconfirmed', function() {
			server.filter( createTweetActivity(true, false, false, false) );
			test.value( lastLog ).contains( unconfirmedString );
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
	
	// TODO Add test for connectStream function
	
});