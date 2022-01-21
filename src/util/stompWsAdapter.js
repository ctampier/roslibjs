var StompJs = require('@stomp/stompjs');


function StompWsAdapter(uri, transportOptions) {

  // Get the topic names from the transportOptions
  this.subTopic = transportOptions.subTopic || 'sub';
  this.pubTopic = transportOptions.pubTopic || 'pub';
  
  var stompConfig_ = {
    // Get the broker conection info from the transportOptions
    connectHeaders: {
      login: transportOptions.user || 'guest',
      passcode: transportOptions.password || 'guest'
    },

    brokerURL: uri,

    // Keep it off for production, it can be quit verbose
    // Skip this key to disable
    debug: function (str) {
      console.log('STOMP: ' + str);
    },

    // If disconnected, it will retry after 200ms
    reconnectDelay: 200,

    // Connection handler
    onConnect: this.handleConnect_.bind(this)
  };

  // Create an instance
  this.stompClient_ = new StompJs.Client(stompConfig_);

  // Attempt to connect
  this.stompClient_.activate();
}

StompWsAdapter.prototype.handleConnect_ = function (frame) {
  // Call the onopen method of the SocketAdapter class
  this.onopen();
  // Subscriptions should be done inside onConnect as those need to reinstated when the broker reconnects
  this.stompClient_.subscribe('/topic/'+this.subTopic, function (message) {
    // Call the onmessage method of the SocketAdapter class
    this.onmessage(message.body);
  }.bind(this));
};

StompWsAdapter.prototype.send = function(data) {
  this.stompClient_.publish({destination: '/topic/'+this.pubTopic, body: data});
};

StompWsAdapter.prototype.close = function() {
  this.stompClient_.deactivate();
};

module.exports = StompWsAdapter;
