'use strict';

/* jshint node:true */
/* jshint unused:vars */ // We want to keep function parameters on callbacks like the originals
/* jshint curly:false */ // Don't require curly brackets around one-line statements

/* jshint -W079 */
var test = require('unit.js');
/* jshint +W079 */
var CognicityReportsPowertrack = require('../CognicityReportsPowertrack.js');

// Create server and mock functions as required
var server = new CognicityReportsPowertrack(
	{},
	{},
	{},
	{ // Logger
		error:function(msg){ lastLog = msg; },
		warn:function(msg){ lastLog = msg; },
		info:function(msg){ lastLog = msg; },
		verbose:function(msg){ lastLog = msg; },
		debug:function(msg){ lastLog = msg; }
	}
);

// Store the last message we logged; this lets us do some neat testing of code paths
var lastLog = "";

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

		before( function() {
			// Retain functions we're going to mock out
			oldInsertConfirmed = server.insertConfirmed;
			oldInsertNonSpatial = server.insertNonSpatial;
			oldinsertUnConfirmed = server.insertUnConfirmed;
			oldinsertInvitee = server.insertInvitee;
			oldSendReplyTweet = server.sendReplyTweet;
			oldGetMessage = server.getMessage;
			
			// Mock these methods so they do nothing (and don't crash during the test!)
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
		
		after( function() {
			// Reconnect the methods we mocked out
			server.insertConfirmed = oldInsertConfirmed;
			server.insertNonSpatial = oldInsertNonSpatial;
			server.insertUnConfirmed = oldinsertUnConfirmed;
			server.insertInvitee = oldinsertInvitee;
			server.sendReplyTweet = oldSendReplyTweet;
			server.getMessage = oldGetMessage;
		});
	});
	
	// TODO Add tests for dbQuery function
	// TODO Add test for connectStream function
	
});