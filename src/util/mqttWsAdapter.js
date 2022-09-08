var Paho;
if (typeof window !== 'undefined') {
  Paho = require('./mqttws31.js');
}
var { nanoid } = require('nanoid');
const axios = require('axios');
var base64 = require('base-64');

function mqttTopicName(rosTopicName) {
  var topicName = rosTopicName;
  // Remove first slash if present
  if (topicName.at(0) === '/') {
    topicName = topicName.substring(1);
  }
  // Change all subsequent slashes for points
  return topicName.replace(/\//g, '.');
}

function MqttWsAdapter(uri, transportOptions) {
  // Get the transportOptions
  this.user = transportOptions.user || 'guest';
  this.password = transportOptions.password || 'guest';
  this.serverCommandDestination =
    transportOptions.serverCommandDestination || 'server-command';
  this.clientCommandDestination =
    transportOptions.clientCommandDestination || 'client-command';
  this.heartbeat = transportOptions.heartbeat || 0;

  // Create an instance
  if (Paho) {
    this.mqttClient_ = new Paho.MQTT.Client(uri, 'client' + nanoid());
  } else {
    throw 'The MQTT WS client can only be used from a web browser.';
  }

  // Set callback handlers
  this.mqttClient_.onConnectionLost = function (responseObject) {
    if (responseObject.errorCode !== 0) {
      console.log('onConnectionLost:' + responseObject.errorMessage);
    }
  };
  this.mqttClient_.onMessageArrived = function (message) {
    // Call the onmessage method of the SocketAdapter class
    this.onmessage(message.payloadString);
  }.bind(this);

  // Set connection options
  var options = {
    timeout: 3,
    keepAliveInterval: this.heartbeat,
    userName: this.user,
    password: this.password,
    onSuccess: this.handleConnect_.bind(this),
    onFailure: function (message) {
      console.log('CONNECTION FAILURE - ' + message.errorMessage);
    },
  };

  // Attempt to connect
  this.mqttClient_.connect(options);
}

MqttWsAdapter.prototype.handleConnect_ = function (frame) {
  // Call the onopen method of the SocketAdapter class
  this.onopen();
  // Subscriptions should be done inside onConnect as those need to reinstated when the broker reconnects
  this.mqttClient_.subscribe(this.serverCommandDestination, {
    qos: 1,
  });
};

MqttWsAdapter.prototype.send = async function (data) {
  var message = JSON.parse(typeof data === 'string' ? data : data.data);
  var topicName = mqttTopicName(message.topic);
  var headers = {};
  // If the command message is subscribe
  if (message.op === 'subscribe') {
    this.mqttClient_.subscribe(topicName, { qos: 1 });
  }
  // If the command message was unsubscribe, delete the listener to the topic
  if (message.op === 'unsubscribe') {
    this.mqttClient_.unsubscribe(topicName);
  }
  // For published data, switch to the topic name in the message
  var destination = this.clientCommandDestination;
  if (message.op === 'publish') {
    destination = topicName;
  }
  // Finally, send the message
  this.mqttClient_.send(destination, data, 1);
};

MqttWsAdapter.prototype.close = function () {
  try {
    this.mqttClient_.disconnect();
  } catch (err) {
    console.log('Error disconnecting from MQTT broker: ' + err);
  }
};

module.exports = MqttWsAdapter;
