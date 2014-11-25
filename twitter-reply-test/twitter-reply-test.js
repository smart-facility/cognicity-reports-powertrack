'use strict';

/**
 * Test reply sending of tweets via ntwitter module.
 * 
 * Sends tweet to the specified user, in reply to the ID extracted from an ATOM form ID returned from Gnip.
 * 
 * Alter the variable definitions below and run the script via
 * 'node twitter-reply-test.js'
 */

// Modules
/** ntwitter twitter interface module */
var twitter = require('ntwitter');

// Variables
var user = ''; // E.g. petajkt
var message = "Hi this is a reply";
var originalTweetAtomId = "tag:search.twitter.com,2005:5377776775";
var twitterConsumerKey = "";
var twitterConsumerSecret = "";
var twitterAccessTokenKey = "";
var twitterAccessTokenSecret = "";

// Configure new instance of the ntwitter interface
/** ntwitter interface instance */
var twit = new twitter({
	consumer_key: twitterConsumerKey,
	consumer_secret: twitterConsumerSecret,
	access_token_key: twitterAccessTokenKey,
	access_token_secret: twitterAccessTokenSecret
});

// Send a tweet and queue up the next tweet send for the specified delay
function tweet() {
	var msg = '@' + user + ' ' + message + " " + new Date().getTime();

	var originalTweetId = originalTweetAtomId;
	originalTweetId = originalTweetId.split(':');
	originalTweetId = originalTweetId[originalTweetId.length-1];
	
	var params = {};
	params.in_reply_to_status_id = originalTweetId; 
	
	console.log("Sending tweet: " + msg);
	console.log("With params: " + JSON.stringify(params));
	
	twit.updateStatus(msg, params, function(err, data){
		if (err) console.log('Tweeting failed: ' + err);
		else console.log('Sent tweet.');
		console.log("Data: " + JSON.stringify(data));
	});		
}

tweet();
