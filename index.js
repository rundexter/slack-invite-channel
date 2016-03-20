var _           = require('lodash')
  , agent       = require('superagent')
  , q           = require('q')
  , baseUrl     = 'https://slack.com/api/'
;

module.exports = {
    /**
     * Allows the authenticating users to follow the user specified in the ID parameter.
     *
     * @param {AppStep} step Accessor for the configuration for the step using this module.  Use step.input('{key}') to retrieve input data.
     * @param {AppData} dexter Container for all data used in this workflow.
     */
    run: function(step, dexter) {
        var users = step.input('user_id')
          , channels = step.input('channel_id')
          , token = dexter.provider('slack').credentials('access_token')
          , self  = this
          , url   = baseUrl + 'channels.invite'
          , promises = []
          , req 
          , channel
        ;

        _.each(users, function(user, idx) {
            channel = channels[idx] || channels.first();

            promises.push(
                q.all([self.getChannel(token, channel), self.getUser(token, user)])
                    .then( function(results) {
                        var channel = results[0]
                          , user    = results[1]
                        ;

                        req = agent.post(url)
                                .type('form')
                                .send(_.extend({token: token, user: user, channel: channel.id }))
                        ;

                        return promisify(req, 'end', 'body.group')
                                .catch(function(err) {
                                    console.log(err.error, channel);
                                    if(err.error === 'cant_invite_self') {
                                        return promisify(
                                            agent.post(baseUrl+'channels.join')
                                                .type('form')
                                                .send({token: token, name: channel.name })
                                            , 'end'
                                        );
                                    }

                                    throw err;
                                });
                    })
            );
        });

        q.all(promises)
          .then(this.complete.bind(this))
          .catch(this.fail.bind(this))
        ;
    }

    /**
     *  Gets the full channel object either by name or id
     *
     *  @param { String } token - access token
     *  @param { String } channel - the channel id or name
     *
     *  @return { q/Promise} 
     */
    , getChannel: function(token, channel) {
        return promisify(
            agent.post(baseUrl+'channels.list')
              .type('form')
              .send({ token: token })
              , 'end', 'body.channels'
        ).then(function(channels) {
            var objChannel;
            if(channel[0] === '#') {
                objChannel=_.find(channels, { name: channel.substr(1) });
            } else {
                objChannel=_.find(channels, { id: channel });
            }

            if(objChannel)
                return objChannel;

            throw new Error("Channel not found.");
        });
    }

    /**
     *  Checks the user param, determines if it's an ID
     *  if it's an ID, returns it, else finds the ID
     *
     *  @param { String } token - access token
     *  @param { String } user  - A user ID or username
     *
     *  @returns a promise or user id
     */
    , getUser: function(token, user) {
        if(user[0] === '@') {
           return promisify(
             agent.post(baseUrl+'users.list')
                .type('form')
                .send({ token: token })
             , 'end', 'body.members'
           ).then(function(members) {
              var objUser=_.find(members, { name: user.substr(1) });
              
              if(objUser) {
                return objUser.id;
              }

              throw new Error("User not found.");
           });
        } else {
           return user;
        }
    }
};

function promisify(scope, call, path) {
    var deferred = q.defer(); 

    scope[call](function(err, result) {
        return err || !_.get(result,'body.ok')
          ? deferred.reject(err || result.body)
          : deferred.resolve(_.get(result, path))
        ;
    });

    return deferred.promise;
}
