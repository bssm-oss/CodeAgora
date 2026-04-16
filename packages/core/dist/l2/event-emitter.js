import { EventEmitter } from "events";
class DiscussionEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }
  emitEvent(event) {
    this.emit(event.type, event);
    this.emit("*", event);
  }
  dispose() {
    this.removeAllListeners();
  }
}
export {
  DiscussionEmitter
};
