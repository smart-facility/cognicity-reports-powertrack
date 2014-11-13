'use strict';

/* jshint node:true */
/* jshint unused:vars */ // We want to keep function parameters on callbacks like the originals
/* jshint curly:false */ // Don't require curly brackets around one-line statements

/**
 * Test bulk sending of tweets via ntwitter module.
 * 
 * Sends tweets with a timestamp to the specified user, repeating
 * a number of times with a delay between each send.
 * 
 * Alter the variable definitions below and run the script via
 * 'node twitter-send-test.js'
 * 
 * Test this with 1 tweet at a time until you're sure the settings are correct!
 */

// Modules
/** ntwitter twitter interface module */
var twitter = require('ntwitter');

// Variables
var tweets = 1;
var delay = 5000;
var user = '';
var message = "";
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
	twit.updateStatus(msg, function(err, data){
		if (err) console.log('Tweeting failed: ' + err);
		else console.log('Sent tweet: "'+msg+'"');
	});	
	
	tweets--;
	if (tweets > 0) setTimeout( tweet, delay );
}

console.log("Sending " + tweets + " tweets with delay " + delay + "ms");

tweet();
