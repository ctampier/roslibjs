var StompJs = require('@stomp/stompjs');
var { nanoid } = require('nanoid');
const axios = require('axios');
var base64 = require('base-64');

function stompTopicName(rosTopicName) {
  var topicName = rosTopicName;
  // Remove first slash if present
  if (topicName.at(0) === '/') {
    topicName = topicName.substring(1);
  }
  // Change all subsequent slashes for points
  return topicName.replace(/\//g, '.');
}

function StompWsAdapter(uri, transportOptions) {

  // Get the transportOptions
  this.user = transportOptions.user || 'guest';
  this.password = transportOptions.password || 'guest';
  this.serverCommandDestination = transportOptions.serverCommandDestination || '/topic/server-command';
  this.clientCommandDestination = transportOptions.clientCommandDestination || '/topic/client-command';
  this.reconnectDelay = transportOptions.reconnectDelay;
  this.useHistory = transportOptions.useHistory || true;
  this.historyLength = transportOptions.historyLength || 100;
  
  var stompConfig_ = {
    // Get the broker conection info from the transportOptions
    connectHeaders: {
      login: this.user,
      passcode: this.password
    },

    brokerURL: uri,

    // Keep it off for production, it can be quit verbose
    // Skip this key to disable
    debug: function (str) {
      console.log('STOMP: ' + str);
    },

    // If disconnected, it will retry after the time (in ms) specified in the transportOptions
    reconnectDelay: this.reconnectDelay,

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
  this.stompClient_.subscribe(this.serverCommandDestination, function (message) {
    // Call the onmessage method of the SocketAdapter class
    this.onmessage(message.body);
  }.bind(this));
};

StompWsAdapter.prototype.send = async function(data) {
  var message = JSON.parse(typeof data === 'string' ? data : data.data);
  var topicName = stompTopicName(message.topic);
  var headers = {};
  // If the command message is subscribe
  if(message.op === 'subscribe') {
    // If using history, create a new exchange in the server
    if (this.useHistory) {
      var config ={
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + base64.encode(this.user + ':' + this.password)
        }
      };
      var body = {
        type:'x-recent-history',
        auto_delete: true,
        durable: false,
        arguments: {
          'x-recent-history-length': this.historyLength
        }
      };
      try {
        var response = await axios.put(`http://localhost:15672/api/exchanges/%2F/${topicName}`, body, config);
      
        if (response.status >= 200 && response.status < 300) {
          console.log('New exchange created for topic %s', message.topic);
        }
      } catch (error) {
        console.log(error);
        console.log('Will try to re-send in %s milliseconds', this.reconnectDelay);
        setTimeout(this.send.bind(this, data), this.reconnectDelay); // will try to resend the message after the timeout
        return;
      }
    }
    // Add a receipt header
    var receiptId = nanoid();
    headers.receipt = receiptId;
    // When the receipt has been acknowledged, create a STOMP subscription to the proper destination
    this.stompClient_.watchForReceipt(receiptId, () => {
      var prefix = '/topic/';
      // Change the destination to an exchange if using history for subscriptions
      if(this.useHistory) {
        prefix = '/exchange/';
      }
      this.stompClient_.subscribe(
        prefix + topicName, 
        function (message) {
          // Call the onmessage method of the SocketAdapter class
          this.onmessage(message.body);
        }.bind(this),
        { id: topicName }
      );
    });
  }
  // If the command message was unsubscribe, delete the listener to the topic
  if(message.op === 'unsubscribe') {
    this.stompClient_.unsubscribe(topicName);
  }
  // For published data, switch to the topic name in the message
  var destination = this.clientCommandDestination;
  if(message.op === 'publish') {
    destination = '/topic/' + topicName;
  }
  this.stompClient_.publish({
    destination: destination, 
    body: data,
    headers: headers
  });
};

StompWsAdapter.prototype.close = function() {
  this.stompClient_.deactivate();
};

module.exports = StompWsAdapter;
