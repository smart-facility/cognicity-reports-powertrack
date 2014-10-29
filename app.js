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
var winston = require('winston');

// Verify expected arguments
if (process.argv[2]){
	var config = require(__dirname+'/'+process.argv[2]); 
} else {
	throw new Error('No config file. Usage: node app.js config.js')
}

// TODO Verify DB connection is up
// TODO Handle DB conenction errors in DB functions (as well as query errors)

// Create a list of keywords and usernames from config
config.twitter.keywords = config.twitter.track.split(',');
config.twitter.usernames = config.twitter.users.split(',');

// Gnip vars
var stream;
var streamReconnectTimeout = 1;

// Logging configuration
winston
	// Configure custom File transport to write plain text messages
	.add(winston.transports.File, { 
		filename: __dirname+"/"+config.instance+".log", // Write to projectname.log
		json: false, // Write in plain text, not JSON
		maxsize: config.logger.maxFileSize, // Max size of each file
		maxFiles: config.logger.maxFiles, // Max number of files
		level: config.logger.level // Level of log messages
	})
	// Console transport is no use to us when running as a daemon
	.remove(winston.transports.Console)
	// Ask Winston to format plain text messages nicely
	.cli();

//Twitter
var twit = new twitter({
	consumer_key: config.twitter.consumer_key,
	consumer_secret: config.twitter.consumer_secret,
	access_token_key: config.twitter.access_token_key,
	access_token_secret: config.twitter.access_token_secret
});

twit.verifyCredentials(function (err, data) {
	if (err) {
		winston.error("twit.verifyCredentials: Error verifying credentials: " + err);
		process.exit(1);
	} else {
		winston.info("twit.verifyCredentials: Twitter credentials succesfully verified");
	}
});

// Send @reply Twitter message
function sendReplyTweet(user, message, callback){

		//check if user in database already
		pg.connect(config.pg.conString, function(err, client, done){
		var sql = "SELECT a.user_hash FROM "+config.pg.table_all_users+" a WHERE a.user_hash = md5('"+user+"');"
		
		client.query(sql, function(err, result){
			if (err){
				winston.error(err + ", " + sql);
				done(); // release database connection on error.
			}

			if (result && result.rows){
				if (result.rows.length == 0){
					if (config.twitter.send_enabled == true){
						twit.updateStatus('@'+user+' '+message, function(err, data){
							if (err) {
								winston.error('Tweeting failed: ' + err);
								}
							else {
								if (callback){
									callback();
								}
								
							}
						});	
				
					}
					
					else { // for testing
						winston.info('sendReplyTweet is in test mode - no message will be sent. Callback will still run.');
						winston.info('@'+user+' '+message);
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
		var sql = "SELECT upsert_tweet_users(md5('"+tweet.user.screen_name+"'));";
		client.query(sql, function(err, result){
			if (err){
				winston.error(err + ", " + sql);
				done();
			}
		});
		if (err){
			winston.error(err + ", " + sql);
			done();
		}
	});
}

function insertConfirmed(tweet){
	//insertUser with count -> upsert
	
	pg.connect(config.pg.conString, function(err, client, done){
		var geomString = "'POINT("+tweet.coordinates.coordinates[0]+" "+tweet.coordinates.coordinates[1]+")',4326";
		var sql = "INSERT INTO "+config.pg.table_tweets+" (created_at, text, hashtags, urls, user_mentions, lang, the_geom) VALUES (to_timestamp('"+new Date(Date.parse(tweet.created_at)).toLocaleString()+"'::text, 'Dy Mon DD YYYY HH24:MI:SS +ZZZZ'), $$"+tweet.text+"$$, '"+JSON.stringify(tweet.entities.hashtags)+"', '"+JSON.stringify(tweet.entities.urls)+"', '"+JSON.stringify(tweet.entities.user_mentions)+"', '"+tweet.lang+"', ST_GeomFromText("+geomString+"));"
		
		client.query(sql, function(err, result){
			if (err){
				winston.error(err + ", " + sql);
				done();
			}
			done();
			winston.info('Logged confirmed tweet report');
			insertConfirmedUser(tweet);
			});
		if (err){
			winston.error(err + ", " + sql);
			done();	
			}	
		});
	}
	
function insertInvitee(tweet){
	pg.connect(config.pg.conString, function(err, client, done){
		var sql = "INSERT INTO "+config.pg.table_invitees+" (user_hash) VALUES (md5('"+tweet.user.screen_name+"'));"
		
		client.query(sql, function(err, result){
			if (err){
				winston.error(err + ", " + sql);
				done();
			}
			else {
				done();
				winston.info('Logged new invitee');	
			}
		});
		if (err){
			winston.error(err + ", " + sql);
			done();
		}
	});
};
	
function insertUnConfirmed(tweet){

	pg.connect(config.pg.conString, function(err, client, done){
		var geomString = "'POINT("+tweet.coordinates.coordinates[0]+" "+tweet.coordinates.coordinates[1]+")',4326";
		var sql = "INSERT INTO "+config.pg.table_unconfirmed+" (created_at, the_geom) VALUES (to_timestamp('"+new Date(Date.parse(tweet.created_at)).toLocaleString()+"'::text, 'Dy Mon DD YYYY HH24:MI:SS +ZZZZ'), ST_GeomFromText("+geomString+"));"
		client.query(sql, function(err, result){
			if (err){
				winston.error(err + ", " + sql);
				done();
			}
			else {
				done();
				log('Logged unconfirmed tweet report');
			}
		});
		if (err){
			winston.error(err + ", " + sql);
			done();
		}
	});
};

function insertNonSpatialUser(tweet){
	pg.connect(config.pg.conString, function(err, client, done){
		var sql = "INSERT INTO "+config.pg.table_nonspatial_users+" (user_hash) VALUES (md5('"+tweet.user.screen_name+"'));"
		
		client.query(sql, function(err, result){
			if (err) winston.error("insertNonSpatialUser: " + err.message + ", " + err.stack + ", " + sql);
			else winston.info("insertNonSpatialUser: Inserted non-spatial user");
			done();
		});	
	});
}
	
function insertNonSpatial(tweet){
	
	pg.connect(config.pg.conString, function(err, client, done){
		var sql = "INSERT INTO "+config.pg.table_nonspatial_tweet_reports+" (created_at, text, hashtags, urls, user_mentions, lang) VALUES (to_timestamp('"+new Date(Date.parse(tweet.created_at)).toLocaleString()+"'::text, 'Dy Mon DD YYYY H24:MI:SS +ZZZZ'), $$"+tweet.text+"$$, '"+JSON.stringify(tweet.entities.hashtags)+"','"+JSON.stringify(tweet.entities.urls)+"','"+JSON.stringify(tweet.entities.user_mentions)+"','"+tweet.lang+"');"	
	
		client.query(sql, function(err, result){
			if (err){
				winston.error(err + ", " + sql);
				done();
			}
			done();
			insertNonSpatialUser(tweet);
			winston.info('Inserted non-spatial tweet');
		});
		if (err){
			winston.error(err + ", " + sql);
			done();
		}	
	});
};
	
function filter(tweet){
	// TODO Optimize filter method, precompile regexes

	winston.debug( 'filter: Received tweet: screen_name="' + tweet.user.screen_name + '", text="' + tweet.text.replace("\n", "") + '", coordinates="' + tweet.coordinates + '"' );
	
	//Keyword check
	for (var i=0; i<config.twitter.keywords.length; i++){
		var re = new RegExp(config.twitter.keywords[i], "gi");
		if (tweet.text.match(re)){
			
			//Username check
			// TODO Should we cope with 0 usernames?
			for (var j=0; j<config.twitter.usernames.length; j++){
				var re = new RegExp(config.twitter.usernames[j], "gi");
				if (tweet.text.match(re)){
										
					// TODO Do real bounding box check here to cope with tweets with geo not in target location
					if (tweet.coordinates != null){
						//Geo check
						winston.debug( 'filter: Tweet matched username, confirmed' );
						insertConfirmed(tweet); //user + geo = confirmed report!
					} else {
						// Keyword, username, no geo
						winston.debug( 'filter: Tweet matched username, no coordinates, asking for geo' );
						
						if (tweet.lang == 'id'){
							insertNonSpatial(tweet); //User sent us a message but no geo, log as such
							sendReplyTweet(tweet.user.screen_name, config.twitter.thanks_text_in); //send geo reminder
						}
						else {
							insertNonSpatial(tweet); //User sent us a message but no geo, log as such
							sendReplyTweet(tweet.user.screen_name, config.twitter.thanks_text_en) //send geo reminder
						}	
					}
					return;
				}
				
				//End of usernames list, no match so message is unconfirmed
				else if(j == config.twitter.usernames.length-1){
					
					//Geo check
					// TODO Do real bounding box check here to cope with tweets with geo not in target location
					if (tweet.coordinates != null){
						winston.debug( 'filter: Tweet has geo but unconfirmed, sending invite' );

						insertUnConfirmed(tweet) //insert unconfirmed report, then invite the user to participate
						if (tweet.lang == 'id'){
							sendReplyTweet(tweet.user.screen_name, config.twitter.invite_text_in, function(){
								insertInvitee(tweet);
							});	
						} else {
							sendReplyTweet(tweet.user.screen_name, config.twitter.invite_text_en, function(){
								insertInvitee(tweet);			
							});
						}
					}
					
					//keyword, no geo, no user - send invite if location match
					else {
						
						//regexp for city
						var re = new RegExp(config.twitter.city, "gi");

						if ( ( tweet.place && tweet.place.full_name && tweet.place.full_name.match(re) ) || ( tweet.user.location != null && tweet.user.location.match(re) ) ) {
							winston.debug( 'filter: Tweet no geo and unconfirmed, location match, sending invite' );
							
							if (tweet.lang == 'id'){
								sendReplyTweet(tweet.user.screen_name, config.twitter.invite_text_in, function(){
									insertInvitee(tweet);
								});
							} else {
								sendReplyTweet(tweet.user.screen_name, config.twitter.invite_text_en, function(){
									insertInvitee(tweet);
								});
							}							
						} else {
							winston.debug( 'filter: Tweet no geo and unconfirmed, no location match, no-op' );							
						}
					}
					return;
				}	
			}
		}
	}
	
	winston.debug( 'filter: Tweet did not match any keywords' );
}

//Stream
function connectStream(){
	// Connect Gnip stream and setup event handlers
	var reconnectTimeoutHandle;

	// TODO Get backfill data on reconnect?
	// TODO Get replay data on reconnect?
	function reconnectSocket() {
		// Try and destroy the existing socket, if it exists
		winston.warn( 'connectStream: Connection lost, destroying socket' );
		if ( stream._req ) stream._req.destroy();
		// Attempt to reconnect
		winston.info( 'connectStream: Attempting to reconnect stream' );
		stream.start();
		streamReconnectTimeout *= 2;
		// TODO Set max timeout and notify if we hit it?
	}

	// TODO We get called twice for disconnect, once from error once from end
	// Is this normal? Can we only use one event? Or is it possible to get only
	// one of those handlers called under some error situations.
	function reconnectStream() {				
		if (reconnectTimeoutHandle) clearTimeout(reconnectTimeoutHandle);
		winston.info( 'connectStream: queing reconnect for ' + streamReconnectTimeout );
		reconnectTimeoutHandle = setTimeout( reconnectSocket, streamReconnectTimeout*1000 );
	}
	
	stream = new Gnip.Stream({
	    url : config.gnip.steamUrl,
	    user : config.gnip.username,
	    password : config.gnip.password
	});
	stream.on('ready', function() {
		winston.info('connectStream: Stream ready!');
	    streamReconnectTimeout = 1;
		// Augment Gnip.Stream._req (Socket) object with a timeout handler.
		// We are accessing a private member here so updates to gnip could break this,
	    // but gnip module does not expose the socket or methods to handle timeout.
		stream._req.setTimeout( config.gnip.streamTimeout, function() {
			reconnectStream();
		});
	});
	stream.on('object', function(tweet) {
		// Catch errors here, otherwise error in filter method is presented as stream error
		try {
		    filter(tweet);
		} catch (err) {
			winston.error("connectStream: Error on object handler:" + err.message + ", " + err.stack);
		}
	});
	stream.on('error', function(err) {
		winston.error("connectStream: Error connecting stream:" + err);
		reconnectStream();
	});
	// TODO Do we need to catch the 'end' event?
	stream.on('end', function() {
		winston.error("connectStream: Stream ended");
		reconnectStream();
	});

	var rules = new Gnip.Rules({
	    url : config.gnip.rulesUrl,
	    user : config.gnip.username,
	    password : config.gnip.password
	});
	// TODO Create rules programatically from config
	/*
	var newRules = [
	    '#hashtag', 
	    'keyword', 
	    '@user',
	    {value: 'keyword as object'},
	    {value: '@demianr85', tag: 'rule tag'}
	];
	
	rules.update(newRules, function(err) {
	    if (err) throw err;
	    stream.start();
	});
	*/
	
	winston.info('connectStream: Connecting stream...');
	stream.start();
}

// Catch unhandled exceptions and log
process.on('uncaughtException', function (err) {
	winston.error('uncaughtException: ' + err.message + ", " + err.stack);
	process.exit(1);
});

process.on('SIGTERM', function() {
	winston.info('SIGTERM: Application shutting down');
	process.exit(0);
});

// Start up - connect the Gnip stream
if ( config.gnip.stream ) connectStream();
