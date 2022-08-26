var autobahn = require("autobahn");

function crossbarTopicName(rosTopicName) {
  var topicName = rosTopicName;
  // Remove first slash if present
  if (topicName.at(0) === "/") {
    topicName = topicName.substring(1);
  }
  // Change all subsequent slashes for points
  return topicName.replace(/\//g, ".");
}

function CrossbarAdapter(url, transportOptions) {
  // Get the transportOptions
  this.serverCommandDestination =
    transportOptions.serverCommandDestination || "server_command";
  this.clientCommandDestination =
    transportOptions.clientCommandDestination || "client_command";

  // Set list of subscribers
  this.topicSubs = [];

  // Create a connection instance
  this.connection = new autobahn.Connection({
    url: url,
    realm: "webgui",
  });

  this.connection.onopen = this.handleConnect_.bind(this);
  this.connection.onclose = this.handleClose_.bind(this);

  // Attempt to connect
  this.connection.open();
}

CrossbarAdapter.prototype.handleConnect_ = function (session) {
  // Call the onopen method of the SocketAdapter class
  this.onopen();
  // Save session as class property
  this.crossbarClient_ = session;
  // Subscriptions should be done inside onConnect as those need to reinstated when the broker reconnects
  this.crossbarClient_.subscribe(
    this.serverCommandDestination,
    function (message) {
      // Call the onmessage method of the SocketAdapter class
      this.onmessage(message[0]);
    }.bind(this)
  );
};

CrossbarAdapter.prototype.handleClose_ = function (reason, details) {
  console.log(`${reason}: ${details}`);
};

CrossbarAdapter.prototype.send = async function (data) {
  var message = JSON.parse(typeof data === "string" ? data : data.data);
  var topicName = crossbarTopicName(message.topic);
  // If the command message is subscribe
  if (message.op === "subscribe") {
    // create a Crossbar subscription to the destination
    var sub = await this.crossbarClient_.subscribe(
      topicName,
      function (message) {
        // Call the onmessage method of the SocketAdapter class
        this.onmessage(message[0]);
      }.bind(this)
    );
    this.topicSubs.push(sub);
  }
  // If the command message was unsubscribe, delete the listener to the topic
  if (message.op === "unsubscribe") {
    for (var sub of this.topicSubs) {
      if (sub.topic === topicName) {
        sub.unsubscribe();
        break;
      }
    }
  }
  // For published data, switch to the topic name in the message
  var destination = this.clientCommandDestination;
  if (message.op === "publish") {
    destination = topicName;
  }
  // Finally, send the message
  this.crossbarClient_.publish(destination, [data]);
};

CrossbarAdapter.prototype.close = function () {
  this.connection.close();
};

module.exports = CrossbarAdapter;
