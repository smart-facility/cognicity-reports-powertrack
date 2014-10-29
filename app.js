//app.js - cognicity-reports modules

/*
Collect unconfirmed reports from Twitter & send report verification tweets

(c) Tomas Holderness & SMART Infrastructure Facility January 2014
Released under GNU GPLv3 License (see LICENSE.txt).

Usage:	node daemon.js cognicity-reports-config.js start
		node daemon.js cognicity-reports-config.js status
		node daemon.js cognicity-reports-config.js stop
*/

//Modules
var sys = require('util');
var fs = require('fs');
var twitter = require('ntwitter'); //twitter streaming API
var Gnip = require('gnip');
var pg = require('pg'); //Postgres

// Verify expected arguments
if (process.argv[2]){
	var config = require(__dirname+'/'+process.argv[2]); 
} else {
	throw new Error('No config file. Usage: node app.js config.js')
}

// TODO Verify DB connection is up

// Create a list of keywords and usernames from config
config.twitter.keywords = config.twitter.track.split(',');
config.twitter.usernames = config.twitter.users.split(',');

// Gnip vars
var stream;
var streamReconnectTimeout = 1;

//Twitter
var twit = new twitter({
	consumer_key: config.twitter.consumer_key,
	consumer_secret: config.twitter.consumer_secret,
	access_token_key: config.twitter.access_token_key,
	access_token_secret: config.twitter.access_token_secret
});

twit.verifyCredentials(function (err, data) {
	if (err) {
		log("inviteMsg - Error verifying credentials: " + err);
		process.exit(1);
	} else {
		log("Twitter credentials succesfully verified");
	}
});

//Logging
function openLog(logfile) {
    return fs.createWriteStream(logfile, {
        flags: "a", encoding: "utf8", mode: 0644
    });
}
var logStream = openLog(__dirname+"/"+config.instance+".log");
function log(msg) {
    logStream.write((new Date).toUTCString() + ": " + msg + "\n");
}
function debug(msg) {
	if ( debug ) logStream.write( (new Date).toUTCString() + ": " + 'DEBUG: ' + msg + "\n" );
}

// Send @reply Twitter message
function sendReplyTweet(user, message, callback){

		//check if user in database already
		pg.connect(config.pg.conString, function(err, client, done){
		var sql = "SELECT a.user_hash FROM "+config.pg.table_all_users+" a WHERE a.user_hash = md5('"+user+"');"
		
		client.query(sql, function(err, result){
			if (err){
				log(err, sql);
				done(); // release database connection on error.
			}
			if (result && result.rows){
				if (result.rows.length == 0){
					if (config.twitter.send_enabled == true){
						twit.updateStatus('@'+user+' '+message, function(err, data){
							if (err) {
								log('Tweeting failed: '+err);
								}
							else {
								if (callback){
									callback();
								}
								
							}
						});	
				
					}
					
					else { // for testing
						console.log('sendReplyTweet is in test mode - no message will be sent. Callback will still run.');
						console.log('@'+user+' '+message);
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
				log(err, sql);
				done();
			}
		});
		if (err){
			log(err, sql);
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
				log(err, sql);
				done();
			}
			done();
			log(new Date()+': logged confirmed tweet report');
			insertConfirmedUser(tweet);
			});
		if (err){
			log(err, sql);
			done();	
			}	
		});
	}
	
function insertInvitee(tweet){
	pg.connect(config.pg.conString, function(err, client, done){
		var sql = "INSERT INTO "+config.pg.table_invitees+" (user_hash) VALUES (md5('"+tweet.user.screen_name+"'));"
		
		client.query(sql, function(err, result){
			if (err){
				log(err, sql);
				done();
			}
			else {
				done();
				log(new Date()+': logged new invitee');	
			}
		});
		if (err){
			log(err, sql);
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
				log(err, sql);
				done();
			}
			else {
				done();
				log(new Date()+': logged unconfirmed tweet report');
			}
		});
		if (err){
			log(err, sql);
			done();
		}
	});
};

function insertNonSpatialUser(tweet){
	pg.connect(config.pg.conString, function(err, client, done){
		var sql = "INSERT INTO "+config.pg.table_nonspatial_users+" (user_hash) VALUES (md5('"+tweet.user.screen_name+"'));"
		
		client.query(sql, function(err, result){
			if (err){
				log(err, sql);
				done();
			}
			done();
			log(new Date()+'Inserted non-spatial user');
		});	
	});
}
	
function insertNonSpatial(tweet){
	
	pg.connect(config.pg.conString, function(err, client, done){
		var sql = "INSERT INTO "+config.pg.table_nonspatial_tweet_reports+" (created_at, text, hashtags, urls, user_mentions, lang) VALUES (to_timestamp('"+new Date(Date.parse(tweet.created_at)).toLocaleString()+"'::text, 'Dy Mon DD YYYY H24:MI:SS +ZZZZ'), $$"+tweet.text+"$$, '"+JSON.stringify(tweet.entities.hashtags)+"','"+JSON.stringify(tweet.entities.urls)+"','"+JSON.stringify(tweet.entities.user_mentions)+"','"+tweet.lang+"');"	
	
		client.query(sql, function(err, result){
			if (err){
				log(err, sql);
				done();
			}
			done();
			insertNonSpatialUser(tweet);
			log('Inserted non-spatial tweet');
		});
		if (err){
			log(err, sql);
			done();
		}	
	});
};
	
function filter(tweet){
	debug( 'filter: Received tweet: screen_name="' + tweet.user.screen_name + '", text="' + tweet.text.replace("\n", "") + '", coordinates="' + tweet.coordinates + '"' );
	
	//Keyword check
	for (var i=0; i<config.twitter.keywords.length; i++){
		var re = new RegExp(config.twitter.keywords[i], "gi");
		if (tweet.text.match(re)){
			
			//Username check
			for (var i=0; i<config.twitter.usernames.length; i++){
				var re = new RegExp(config.twitter.usernames[i], "gi");
				if (tweet.text.match(re)){
					
					//regexp for city
					var re = new RegExp(config.twitter.city, "gi");
					
					if (tweet.coordinates != null){
						//Geo check
						debug( 'filter: Tweet matched username, confirmed' );
						insertConfirmed(tweet); //user + geo = confirmed report!
					} else if ( ( tweet.place != null && tweet.place.match(re) ) || ( tweet.user.location != null && tweet.user.location.match(re) ) ){
						//City location check
						debug( 'filter: Tweet matched username, no coordaintes but place/location match' );
						
						if (tweet.lang == 'id'){
							insertNonSpatial(tweet); //User sent us a message but no geo, log as such
							sendReplyTweet(tweet.user.screen_name, config.twitter.thanks_text_in); //send geo reminder
						}
						else {
							insertNonSpatial(tweet); //User sent us a message but no geo, log as such
							sendReplyTweet(tweet.user.screen_name, config.twitter.thanks_text_en) //send geo reminder
						}	
					} else {
						debug( 'filter: Tweet matched username but no geo or place' );
						// TODO Should this happen? Can we avoid the place/location check above and
						// send geo reminder to anyone tweeting @user with keyword?
					}
					return;
				}
				//End of usernames list, no match so message is unconfirmed
				else if(i == config.twitter.usernames.length-1){
					
					//Geo check
					if (tweet.coordinates != null){
						debug( 'filter: Tweet has geo but unconfirmed, sending invite' );

						insertUnConfirmed(tweet) //insert unconfirmed report, then invite the user to participate
						if (tweet.lang == 'id'){
							sendReplyTweet(tweet.user.screen_name, config.twitter.invite_text_in, function(){
								insertInvitee(tweet);
								});	
							}
						else {
							sendReplyTweet(tweet.user.screen_name, config.twitter.invite_text_en, function(){
								insertInvitee(tweet);			
								});
							}
					}
					
					//no geo, no user - but keyword so send invite
					else {
						debug( 'filter: Tweet no geo and unconfirmed, sending invite' );
						
						// TODO We should be checking location and place here and only sending invite
						// if we get a match
						if (tweet.lang == 'id'){
							sendReplyTweet(tweet.user.screen_name, config.twitter.invite_text_in, function(){
								insertInvitee(tweet);
								});
							}
						else {
							sendReplyTweet(tweet.user.screen_name, config.twitter.invite_text_en, function(){
								insertInvitee(tweet);
								});
							}
					}
					return;
				}	
			}
		}
	}
	
	debug( 'filter: Tweet did not match any keywords' );
}

//Stream
function connectStream(){
	// Connect Gnip stream and setup event handlers
	var reconnectTimeoutHandle;

	function reconnectSocket() {
		// Try and destroy the existing socket, if it exists
		log( 'connectStream: Connection lost, destroying socket' );
		if ( stream._req ) stream._req.destroy();
		// Attempt to reconnect
		log( 'connectStream: Attempting to reconnect stream' );
		stream.start();
		streamReconnectTimeout *= 2;
		// TODO Set max timeout and notify if we hit it?
	}

	function reconnectStream() {				
		if (reconnectTimeoutHandle) clearTimeout(reconnectTimeoutHandle);
		debug( 'connectStream: queing reconnect for ' + streamReconnectTimeout );
		reconnectTimeoutHandle = setTimeout( reconnectSocket, streamReconnectTimeout*1000 );
	}
	
	stream = new Gnip.Stream({
	    url : config.gnip.steamUrl,
	    user : config.gnip.username,
	    password : config.gnip.password
	});
	stream.on('ready', function() {
	    log('connectStream: Stream ready!');
	    streamReconnectTimeout = 1;
		// Augment Gnip.Stream._req (Socket) object with a timeout handler.
		// We are accessing a private member here so updates to gnip could break this,
	    // but gnip module does not expose the socket or methods to handle timeout.
		stream._req.setTimeout( config.gnip.streamTimeout, function() {
			reconnectStream();
		});
	});
	stream.on('object', function(tweet) {
	    filter(tweet);
	});
	stream.on('error', function(err) {
	    log("connectStream: Error connecting stream:" + err);
		reconnectStream();
	});
	stream.on('end', function(err) {
	    log("connectStream: Stream ended: " + err);
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
	
	log('connectStream: Connecting stream...');
	stream.start();
}

// TODO Notify on failure
// TODO Get backfill data?
// TODO Get replay data?
// TODO Make logging messages consistent - date, method, msg
// TODO Optimize filter method, precompile regexes

// Catch unhandled exceptions and log
process.on('uncaughtException', function (err) {
	log('uncaughtException: ' + err.message + err.stack);
	process.exit(1);
});

// Start up - connect the Gnip stream
if ( config.gnip.stream ) connectStream();
