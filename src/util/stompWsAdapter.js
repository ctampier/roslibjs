var StompJs = require('@stomp/stompjs');

function stompTopicName(rosTopicName) {
  var topicName = rosTopicName;
  if (topicName.at(0) === '/') {
    topicName = topicName.substring(1);
  }
  return topicName;
}

function StompWsAdapter(uri, transportOptions) {

  // Get the topic names from the transportOptions
  this.serverCommandTopic = transportOptions.subTopic || 'server-command';
  this.clientCommandTopic = transportOptions.clientCommandTopic || 'client-command';
  
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

    // Heartbeat
    heartbeatIncoming: transportOptions.heartbeatConsumer || 0,
    heartbeatOutgoing: transportOptions.heartbeatProducer || 0,

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
  this.stompClient_.subscribe('/topic/'+this.serverCommandTopic, function (message) {
    // Call the onmessage method of the SocketAdapter class
    this.onmessage(message.body);
  }.bind(this));
};

StompWsAdapter.prototype.send = function(data) {
  // For published data, switch to the topic name in the message
  var topicName = this.clientCommandTopic;
  var message = JSON.parse(typeof data === 'string' ? data : data.data);
  if(message.op === 'publish') {
    topicName = stompTopicName(message.topic);
  }
  this.stompClient_.publish({
    destination: '/topic/'+topicName, 
    body: data
  });
  // If the command message was subscribe, create a listener to the topic
  if(message.op === 'subscribe') {
    this.stompClient_.subscribe(
      '/topic/'+stompTopicName(message.topic), 
      function (message) {
        // Call the onmessage method of the SocketAdapter class
        this.onmessage(message.body);
      }.bind(this),
      { id: stompTopicName(message.topic) }
    );
  }
  // If the command message was unsubscribe, delete the listener to the topic
  if(message.op === 'unsubscribe') {
    this.stompClient_.unsubscribe( stompTopicName(message.topic) );
  }
};

StompWsAdapter.prototype.close = function() {
  this.stompClient_.deactivate();
};

module.exports = StompWsAdapter;
