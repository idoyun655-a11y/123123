/**
 * Ordered scheduled-event queue for the simulation core.
 * Ordering: simulation time -> priority -> insertion sequence.
 */
export class EventQueue {
  #events=[];#sequence=0;
  schedule(event){const normalized={id:event.id,at:new Date(event.at),priority:Number.isFinite(event.priority)?event.priority:0,sequence:this.#sequence++,type:event.type??'generic',payload:event.payload,handler:event.handler};if(Number.isNaN(normalized.at.getTime()))throw new TypeError('Scheduled event time must be a valid Date or date string.');if(typeof normalized.handler!=='function')throw new TypeError('Scheduled event handler must be a function.');let lo=0,hi=this.#events.length;while(lo<hi){const mid=(lo+hi)>>>1;if(EventQueue.#compare(this.#events[mid],normalized)<=0)lo=mid+1;else hi=mid;}this.#events.splice(lo,0,normalized);return normalized.id;}
  peek(){return this.#events[0]??null;}pop(){return this.#events.shift()??null;}
  drainDue(now){const current=now instanceof Date?now.getTime():new Date(now).getTime();let count=0;while(count<this.#events.length&&this.#events[count].at.getTime()<=current)count+=1;if(count===0)return[];return this.#events.splice(0,count);}
  clear(){this.#events=[];}get size(){return this.#events.length;}
  snapshot(){return this.#events.map(event=>({id:event.id,at:new Date(event.at),priority:event.priority,type:event.type,payload:event.payload}));}
  static #compare(a,b){const timeDelta=a.at.getTime()-b.at.getTime();if(timeDelta!==0)return timeDelta;const priorityDelta=a.priority-b.priority;if(priorityDelta!==0)return priorityDelta;return a.sequence-b.sequence;}
}
