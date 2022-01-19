var StompJs = require('@stomp/stompjs');

function StompWsAdapter(uri, transportOptions) {

  var stompConfig_ = {
    // Get the broker conection info from the transportOptions
    connectHeaders: {
      login: transportOptions.user,
      passcode: transportOptions.password
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
    onConnect: this.handleConnect_.bind(this),

    // Disconnection handler
    onWebSocketClose: this.onclose,

    // Error handler
    onWebSocketError: this.onerror,
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
  this.stompClient_.subscribe('/topic/rosmsgs', function (message) {
    // Call the onmessage method of the SocketAdapter class
    this.onmessage(message.body);
  });
};

StompWsAdapter.prototype.send = function(data) {
  this.stompClient_.publish({destination: '/topic/rosmsgs', body: data});
};

StompWsAdapter.prototype.close = function() {
  this.stompClient_.deactivate();
};

module.exports = StompWsAdapter;
