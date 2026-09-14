import { NormalizedObservation, NormalizedEvent, CategoryId } from '../types';

export interface DetectorOptions {
  category: CategoryId;
  eventType: string; // e.g. "HIGH_WAVE"
  threshold: number; // e.g. 3.00
  metric: string;
  unit: string;
}

export class EventDetector {
  private category: CategoryId;
  private eventType: string;
  private threshold: number;
  private metric: string;
  private unit: string;

  // Active state machine state
  private isAboveThreshold: boolean = false;
  private activeEvent: NormalizedEvent | null = null;
  private allEvents: NormalizedEvent[] = [];
  private lastMeasurement: NormalizedObservation | null = null;

  constructor(options: DetectorOptions) {
    this.category = options.category;
    this.eventType = options.eventType;
    this.threshold = options.threshold;
    this.metric = options.metric;
    this.unit = options.unit;
  }

  public getThreshold(): number {
    return this.threshold;
  }

  public setThreshold(newThreshold: number, observationsHistory?: NormalizedObservation[]): NormalizedEvent[] {
    this.threshold = newThreshold;
    if (observationsHistory && observationsHistory.length > 0) {
      return this.processBatch(observationsHistory);
    }
    return this.getEvents();
  }

  public reset(): void {
    this.isAboveThreshold = false;
    this.activeEvent = null;
    this.allEvents = [];
    this.lastMeasurement = null;
  }

  /**
   * Process a single incoming observation sequentially
   * Returns a newly triggered event if this observation crossed the threshold (EVENT START),
   * or null if it did not start a new event.
   */
  public processObservation(obs: NormalizedObservation): NormalizedEvent | null {
    this.lastMeasurement = obs;
    const isNowAbove = obs.value >= this.threshold;
    let newlyTriggeredEvent: NormalizedEvent | null = null;

    if (!this.isAboveThreshold && isNowAbove) {
      // EVENT START: Transition from below (or initial) to above threshold
      this.isAboveThreshold = true;
      const newEvent: NormalizedEvent = {
        id: `${this.category}_${obs.station}_${new Date(obs.timestamp).getTime()}`,
        eventType: this.eventType,
        category: this.category,
        timestamp: obs.timestamp,
        value: obs.value,
        initialValue: obs.value,
        threshold: this.threshold,
        durationMinutes: 0,
        isOngoing: true,
        station: obs.station,
        metric: this.metric,
        unit: this.unit,
        observationsCount: 1
      };
      this.activeEvent = newEvent;
      this.allEvents.push(newEvent);
      newlyTriggeredEvent = newEvent;
    } else if (this.isAboveThreshold && isNowAbove) {
      // EVENT CONTINUES: Remains above threshold
      // Do NOT count as a new event! Update peak and duration.
      if (this.activeEvent) {
        this.activeEvent.value = Math.max(this.activeEvent.value, obs.value);
        this.activeEvent.observationsCount += 1;
        const startMs = new Date(this.activeEvent.timestamp).getTime();
        const currentMs = new Date(obs.timestamp).getTime();
        this.activeEvent.durationMinutes = Math.max(0, Math.round((currentMs - startMs) / 60000));
      }
    } else if (this.isAboveThreshold && !isNowAbove) {
      // EVENT END: Dropped back below threshold
      this.isAboveThreshold = false;
      if (this.activeEvent) {
        this.activeEvent.isOngoing = false;
        this.activeEvent.endTimestamp = obs.timestamp;
        const startMs = new Date(this.activeEvent.timestamp).getTime();
        const currentMs = new Date(obs.timestamp).getTime();
        this.activeEvent.durationMinutes = Math.max(0, Math.round((currentMs - startMs) / 60000));
        this.activeEvent = null;
      }
    }

    return newlyTriggeredEvent;
  }

  /**
   * Process a chronological series of observations (oldest to newest)
   */
  public processBatch(observations: NormalizedObservation[]): NormalizedEvent[] {
    this.reset();
    for (const obs of observations) {
      this.processObservation(obs);
    }
    return this.getEvents();
  }

  public getEvents(): NormalizedEvent[] {
    return [...this.allEvents];
  }

  public getActiveEvent(): NormalizedEvent | null {
    return this.activeEvent;
  }

  public getLastMeasurement(): NormalizedObservation | null {
    return this.lastMeasurement;
  }

  /**
   * Calculate summary statistics for a given time window (e.g. today or 24H)
   */
  public getStats(referenceDate: Date = new Date()) {
    // Start of reference day (UTC midnight or local midnight)
    const startOfToday = new Date(referenceDate);
    startOfToday.setUTCHours(0, 0, 0, 0);
    const startOfTodayMs = startOfToday.getTime();

    // 24H rolling cutoff
    const twentyFourHoursAgoMs = referenceDate.getTime() - 24 * 60 * 60 * 1000;

    const eventsToday = this.allEvents.filter(e => {
      const eventTime = new Date(e.timestamp).getTime();
      return eventTime >= startOfTodayMs;
    });

    const events24H = this.allEvents.filter(e => {
      const eventTime = new Date(e.timestamp).getTime();
      return eventTime >= twentyFourHoursAgoMs;
    });

    const lastEvent = this.allEvents.length > 0 ? this.allEvents[this.allEvents.length - 1] : null;

    return {
      currentValue: this.lastMeasurement ? this.lastMeasurement.value : null,
      threshold: this.threshold,
      eventsTodayCount: eventsToday.length,
      events24HCount: events24H.length,
      totalEventsCount: this.allEvents.length,
      lastEvent,
      activeEvent: this.activeEvent,
      isCurrentlyExceeded: this.isAboveThreshold
    };
  }
}
