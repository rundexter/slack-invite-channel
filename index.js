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
                                .send(_.extend({token: token, user: user, channel: channel }))
                        ;

                        return promisify(req, 'end', 'body.group');
                    })
            );
        });

        q.all(promises)
          .then(this.complete.bind(this))
          .catch(this.fail.bind(this))
        ;
    }

    , getChannel: function(token, channel) {
        if(channel[0] === '#') {
           return promisify(
             agent.post(baseUrl+'channels.list')
                .type('form')
                .send({ token: token })
             , 'end', 'body.channels'
           ).then(function(channels) {
              var objChannel=_.find(channels, { name: channel.substr(1) });
              
              if(objChannel) {
                return objChannel.id;
              }

              throw new Error("Channel not found.");
           });
        } else {
           return channel;
        }

    }

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
