//app.js - cognicity-reports modules

/*
Collect unconfirmed reports from Twitter & send report verification tweets

(c) Tomas Holderness & SMART Infrastructure Facility January 2014
Released under GNU GPLv3 License (see LICENSE.txt).

Usage:	node daemon.js cognicity-reports-config.js start
		node daemon.js cognicity-reports-config.js status
		node daemon.js cognicity-reports-config.js stop
*/

// TODO jsdoc methods

//Modules
var sys = require('util');
var fs = require('fs');
var twitter = require('ntwitter'); //twitter streaming API
var Gnip = require('gnip');
var pg = require('pg'); //Postgres
var logger = require('winston');

// Verify expected arguments
if (process.argv[2]){
	var config = require(__dirname+'/'+process.argv[2]); 
} else {
	throw new Error('No config file. Usage: node app.js config.js')
}

// TODO Verify DB connection is up
// TODO Handle DB conenction errors in DB functions (as well as query errors)

// Gnip vars
var stream;
var streamReconnectTimeout = 1;

// Logging configuration
logger
	// Configure custom File transport to write plain text messages
	.add(logger.transports.File, { 
		filename: __dirname+"/"+config.instance+".log", // Write to projectname.log
		json: false, // Write in plain text, not JSON
		maxsize: config.logger.maxFileSize, // Max size of each file
		maxFiles: config.logger.maxFiles, // Max number of files
		level: config.logger.level // Level of log messages
	})
	// Console transport is no use to us when running as a daemon
	.remove(logger.transports.Console);

//Twitter
var twit = new twitter({
	consumer_key: config.twitter.consumer_key,
	consumer_secret: config.twitter.consumer_secret,
	access_token_key: config.twitter.access_token_key,
	access_token_secret: config.twitter.access_token_secret
});

twit.verifyCredentials(function (err, data) {
	if (err) {
		logger.error("twit.verifyCredentials: Error verifying credentials: " + err);
		process.exit(1);
	} else {
		logger.info("twit.verifyCredentials: Twitter credentials succesfully verified");
	}
});

/**
 * Resolve message code from config.twitter.
 * Will fall back to trying to resolve message using default language set in configuration.
 * @param {string} code Code to lookup in config.twitter 
 * @param {string} lang Language to lookup in config.twitter[code]
 * @returns {string} Message code, or null if not resolved.
 */
function getMessage(code, lang) {
	if (config.twitter[code]) {
		if (config.twitter[code][lang]) return config.twitter[code][lang];
		if (config.twitter[code][config.twitter.defaultLanguage]) return config.twitter[code][config.twitter.defaultLanguage];
	}
	
	logger.warn( "getMessage: Code could not be resolved for '" + code + "' and lang '" + lang +"'" );
	return null;
}

// Send @reply Twitter message
function sendReplyTweet(user, message, callback){

		//check if user in database already
		pg.connect(config.pg.conString, function(err, client, done){
		var sql = "SELECT a.user_hash FROM "+config.pg.table_all_users+" a WHERE a.user_hash = md5('"+user+"');"
		
		client.query(sql, function(err, result){
			if (err){
				logger.error(err + ", " + sql);
				done(); // release database connection on error.
			}

			if (result && result.rows){
				if (result.rows.length == 0){
					if (config.twitter.send_enabled == true){
						twit.updateStatus('@'+user+' '+message, function(err, data){
							if (err) {
								logger.error('Tweeting failed: ' + err);
								}
							else {
								if (callback){
									callback();
								}
								
							}
						});	
				
					}
					
					else { // for testing
						logger.info('sendReplyTweet is in test mode - no message will be sent. Callback will still run.');
						logger.info('@'+user+' '+message);
						if (callback){
							callback();
						}
					}
				}
			}
			done();
		});
	});
}

//Insert Statements

function insertConfirmedUser(tweet){
	pg.connect(config.pg.conString, function(err, client, done){
		var sql = "SELECT upsert_tweet_users(md5('"+tweet.actor.preferredUsername+"'));";
		client.query(sql, function(err, result){
			if (err){
				logger.error(err + ", " + sql);
				done();
			}
		});
		if (err){
			logger.error(err + ", " + sql);
			done();
		}
	});
}

function insertConfirmed(tweet){
	//insertUser with count -> upsert
	
	pg.connect(config.pg.conString, function(err, client, done){
		var geomString = "'POINT("+tweet.geo.coordinates[0]+" "+tweet.geo.coordinates[1]+")',4326";
		var sql = "INSERT INTO "+config.pg.table_tweets+" (created_at, text, hashtags, urls, user_mentions, lang, the_geom) VALUES (to_timestamp('"+new Date(Date.parse(tweet.postedTime)).toLocaleString()+"'::text, 'Dy Mon DD YYYY HH24:MI:SS +ZZZZ'), $$"+tweet.body+"$$, '"+JSON.stringify(tweet.twitter_entities.hashtags)+"', '"+JSON.stringify(tweet.twitter_entities.urls)+"', '"+JSON.stringify(tweet.twitter_entities.user_mentions)+"', '"+tweet.twitter_lang+"', ST_GeomFromText("+geomString+"));"
		
		client.query(sql, function(err, result){
			if (err){
				logger.error(err + ", " + sql);
				done();
			}
			done();
			logger.info('Logged confirmed tweet report');
			insertConfirmedUser(tweet);
			});
		if (err){
			logger.error(err + ", " + sql);
			done();	
			}	
		});
	}
	
function insertInvitee(tweet){
	pg.connect(config.pg.conString, function(err, client, done){
		var sql = "INSERT INTO "+config.pg.table_invitees+" (user_hash) VALUES (md5('"+tweet.actor.preferredUsername+"'));"
		
		client.query(sql, function(err, result){
			if (err){
				logger.error(err + ", " + sql);
				done();
			}
			else {
				done();
				logger.info('Logged new invitee');	
			}
		});
		if (err){
			logger.error(err + ", " + sql);
			done();
		}
	});
};
	
function insertUnConfirmed(tweet){

	pg.connect(config.pg.conString, function(err, client, done){
		var geomString = "'POINT("+tweet.geo.coordinates[0]+" "+tweet.geo.coordinates[1]+")',4326";
		var sql = "INSERT INTO "+config.pg.table_unconfirmed+" (created_at, the_geom) VALUES (to_timestamp('"+new Date(Date.parse(tweet.postedTime)).toLocaleString()+"'::text, 'Dy Mon DD YYYY HH24:MI:SS +ZZZZ'), ST_GeomFromText("+geomString+"));"
		client.query(sql, function(err, result){
			if (err){
				logger.error(err + ", " + sql);
				done();
			}
			else {
				done();
				logger.info('Logged unconfirmed tweet report');
			}
		});
		if (err){
			logger.error(err + ", " + sql);
			done();
		}
	});
};

function insertNonSpatialUser(tweet){
	pg.connect(config.pg.conString, function(err, client, done){
		var sql = "INSERT INTO "+config.pg.table_nonspatial_users+" (user_hash) VALUES (md5('"+tweet.actor.preferredUsername+"'));"
		
		client.query(sql, function(err, result){
			if (err) logger.error("insertNonSpatialUser: " + err.message + ", " + err.stack + ", " + sql);
			else logger.info("insertNonSpatialUser: Inserted non-spatial user");
			done();
		});	
	});
}
	
function insertNonSpatial(tweet){
	
	pg.connect(config.pg.conString, function(err, client, done){
		var sql = "INSERT INTO "+config.pg.table_nonspatial_tweet_reports+" (created_at, text, hashtags, urls, user_mentions, lang) VALUES (to_timestamp('"+new Date(Date.parse(tweet.postedTime)).toLocaleString()+"'::text, 'Dy Mon DD YYYY H24:MI:SS +ZZZZ'), $$"+tweet.body+"$$, '"+JSON.stringify(tweet.twitter_entities.hashtags)+"','"+JSON.stringify(tweet.twitter_entities.urls)+"','"+JSON.stringify(tweet.twitter_entities.user_mentions)+"','"+tweet.twitter_lang+"');"	
	
		client.query(sql, function(err, result){
			if (err){
				logger.error(err + ", " + sql);
				done();
			}
			done();
			insertNonSpatialUser(tweet);
			logger.info('Inserted non-spatial tweet');
		});
		if (err){
			logger.error(err + ", " + sql);
			done();
		}	
	});
};
	
function filter(tweet){
	logger.verbose( 'filter: Received tweet: screen_name="' + tweet.actor.preferredUsername + '", text="' + tweet.body.replace("\n", "") + '", coordinates="' + (tweet.geo && tweet.geo.coordinates ? tweet.geo.coordinates[0]+", "+tweet.geo.coordinates[1] : 'N/A') + '"' );
	
	// Everything incoming has a keyword already, so we now try and categorize it
	// using the Gnip tags
	var hasGeo = false;
	var addressed = false;
	var locationMatch = false;
	
	tweet.gnip.matching_rules.forEach( function(rule){
		if (rule.tag) {
			if (rule.tag.indexOf("geo")===0) hasGeo = true;
			if (rule.tag.indexOf("addressed")===0) addressed = true;
			if (rule.tag.indexOf("location")===0) locationMatch = true;
		}
	});
	logger.verbose("filter: Categorized tweet via Gnip tags as " + (hasGeo?'+':'-') + "GEO " + (addressed?'+':'-') + "ADDRESSED " + (locationMatch?'+':'-') + "LOCATION");
	
	// Perform the actions for the categorization of the tween
	if ( hasGeo && addressed ) {
		logger.verbose( 'filter: +GEO +ADDRESSED = confirmed report' );
		insertConfirmed(tweet); //user + geo = confirmed report!	
		
	} else if ( !hasGeo && addressed ) {
		// Keyword, username, no geo
		logger.verbose( 'filter: -GEO +ADDRESSED = ask user for geo' );
		
		if (tweet.geo && tweet.geo.coordinates) {
			logger.verbose( 'filter: Tweet has geo coordinates but did not match bounding box, not asking for geo' );
		} else {
			insertNonSpatial(tweet); //User sent us a message but no geo, log as such
			sendReplyTweet( tweet.actor.preferredUsername, getMessage('thanks_text', tweet.twitter_lang) ) //send geo reminder
		}
		
	} else if ( hasGeo && !addressed ) {
		logger.verbose( 'filter: +GEO -ADDRESSED = unconfirmed report, ask user to participate' );

		insertUnConfirmed(tweet) //insert unconfirmed report, then invite the user to participate
		sendReplyTweet(tweet.actor.preferredUsername, getMessage('invite_text', tweet.twitter_lang), function(){
			insertInvitee(tweet);
		});	
		
	} else if ( !hasGeo && !addressed && locationMatch ) {
		logger.verbose( 'filter: -GEO -ADDRESSED +LOCATION = ask user to participate' );
		
		if (tweet.geo && tweet.geo.coordinates) {
			logger.verbose( 'filter: Tweet has geo coordinates but did not match bounding box, not asking to participate' );
		} else {
			sendReplyTweet(tweet.actor.preferredUsername, getMessage('invite_text', tweet.twitter_lang), function(){
				insertInvitee(tweet);
			});
		}
		
	} else {
		logger.warn( 'filter: Tweet did not match category actions' );
	}
}

//Stream
function connectStream(){
	// Connect Gnip stream and setup event handlers
	var reconnectTimeoutHandle;

	// TODO Get backfill data on reconnect?
	// TODO Get replay data on reconnect?
	function reconnectSocket() {
		// Try and destroy the existing socket, if it exists
		logger.warn( 'connectStream: Connection lost, destroying socket' );
		if ( stream._req ) stream._req.destroy();
		// Attempt to reconnect
		logger.info( 'connectStream: Attempting to reconnect stream' );
		stream.start();
		streamReconnectTimeout *= 2;
		// TODO Set max timeout and notify if we hit it?
	}

	// TODO We get called twice for disconnect, once from error once from end
	// Is this normal? Can we only use one event? Or is it possible to get only
	// one of those handlers called under some error situations.
	function reconnectStream() {				
		if (reconnectTimeoutHandle) clearTimeout(reconnectTimeoutHandle);
		logger.info( 'connectStream: queing reconnect for ' + streamReconnectTimeout );
		reconnectTimeoutHandle = setTimeout( reconnectSocket, streamReconnectTimeout*1000 );
	}
	
	stream = new Gnip.Stream({
	    url : config.gnip.steamUrl,
	    user : config.gnip.username,
	    password : config.gnip.password
	});
	
	stream.on('ready', function() {
		logger.info('connectStream: Stream ready!');
	    streamReconnectTimeout = 1;
		// Augment Gnip.Stream._req (Socket) object with a timeout handler.
		// We are accessing a private member here so updates to gnip could break this,
	    // but gnip module does not expose the socket or methods to handle timeout.
		stream._req.setTimeout( config.gnip.streamTimeout, function() {
			reconnectStream();
		});
	});

	stream.on('tweet', function(tweet) {
		// Catch errors here, otherwise error in filter method is presented as stream error
		logger.debug("connectStream: stream.on('tweet'): tweet = " + JSON.stringify(tweet));
		try {
		    filter(tweet);
		} catch (err) {
			logger.error("connectStream: stream.on('tweet'): Error on handler:" + err.message + ", " + err.stack);
		}
	});
	
	stream.on('error', function(err) {
		logger.error("connectStream: Error connecting stream:" + err);
		reconnectStream();
	});
	
	// TODO Do we need to catch the 'end' event?
	stream.on('end', function() {
		logger.error("connectStream: Stream ended");
		reconnectStream();
	});

	var rules = new Gnip.Rules({
	    url : config.gnip.rulesUrl,
	    user : config.gnip.username,
	    password : config.gnip.password
	});
	
	// Create rules programatically from config
	var newRules = [];
	for (var tag in config.gnip.rules) {
		newRules.push({
			tag: tag,
			value: config.gnip.rules[tag]
		});
	}
	logger.debug('connectStream: Rules = ' + JSON.stringify(newRules));
	
	logger.info('connectStream: Updating rules...');
	rules.update(newRules, function(err) {
	    if (err) throw err;
		logger.info('connectStream: Connecting stream...');
		stream.start();
	});
	
}

// Catch unhandled exceptions and log
process.on('uncaughtException', function (err) {
	logger.error('uncaughtException: ' + err.message + ", " + err.stack);
	process.exit(1);
});

process.on('SIGTERM', function() {
	logger.info('SIGTERM: Application shutting down');
	process.exit(0);
});

// Start up - connect the Gnip stream
if ( config.gnip.stream ) connectStream();
