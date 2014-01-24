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
var pg = require('pg'); //Postgres

if (process.argv[2]){
	var config = require(__dirname+'/'+process.argv[2]); 
	}

else{
	throw new Error('No config file. Usage: node app.js config.js')
	}
	
// Create a list of keywords and usernames from config
config.twitter.keywords = config.twitter.track.split(',');
config.twitter.usernames = config.twitter.users.split(',');

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
	}
else {
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
    logStream.write(msg + "\n");
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
					
					//Geo check
					if (tweet.coordinates != null){
						insertConfirmed(tweet); //user + geo = confirmed report!
					}
					
					//City location check
					else if(tweet.place != null && tweet.place.match(re) || tweet.user.location != null && tweet.user.location.match(re)){
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
				else if(i == config.twitter.usernames.length-1){
					
					//Geo check
					if (tweet.coordinates != null){
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
}

//Stream
function connectStream(){

	if (config.twitter.stream == true){
		twit.stream('statuses/filter',{'locations':config.twitter.bbox, 'track':config.twitter.track} ,function(stream){
			stream.on('data', function (data){
				if (data.warning){
					log(JSON.stringify(data.warning.code)+':'+JSON.stringify(data.warning.message));
				}
				if (data.disconnect){
					log('disconnect code:'+JSON.stringify(data.disconnect.code));
				}
				else {
					filter(data);					
					time = new Date().getTime(); //Updated the time with last tweet.
					}
				});
			stream.on('error', function(error, code){
				log('Twitter stream error: ' + JSON.stringify(error) + JSON.stringify(code));
				log('Stream error details: ' + JSON.stringify(arguments)); //Added extra log details to help with debugging.
				})
			stream.on('end', function(){
				log('stream has been disconnected');
				})
			stream.on('destroy', function(){
				log('stream has died');
				})
			//Catch an un-handled disconnection
			if (time!=0){
				if (new Date().getTime() - time > config.twitter.stream.timeout){
					// Try to destroy the existing stream
					log(new Date()+': Un-handled stream error, reached timeout - attempting to reconnect')
					stream.destroy;
					// Start stream again and reset time.
					time = 0;
					connectStream();
				}
			}
		})
	};
}
var time = 0;
// Brute force stream management  - create a new stream if existing one dies without a trace.
function forceStreamAlive(){
	if (time != 0){
		if (new Date().getTime() - time > config.twitter.timeout){
			log(new Date()+': Timeout for connectStream() function - attempting to create a new stream');
			time = 0;
			connectStream();
		}
	}
	setTimeout(forceStreamAlive, 1000)
}

log(new Date()+': mj-reports instance: '+config.instance+' started');
connectStream();
forceStreamAlive();