"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  fetchCompanionStatus,
  openCompanionEvents,
  pairCompanion,
  petsFromParty,
  postArrived,
  postLeap,
  publishPresence,
  subscribePresence,
  syncCompanionPets,
  unpairCompanion,
  type CompanionPresence,
} from "@/lib/companion/client";
import type {
  CompanionChatLine,
  CompanionLocation,
  CompanionPairInfo,
  CompanionParcelMeta,
  CompanionThreads,
} from "@/lib/companion/protocol";
import type { PartyMember } from "@/data/party";

type CompanionContextValue = {
  pairInfo: CompanionPairInfo | null;
  paired: boolean;
  locations: Record<string, CompanionLocation>;
  parcels: Record<string, CompanionParcelMeta>;
  asleep: Record<string, boolean>;
  trips: Record<string, number>;
  sheetOpen: boolean;
  setSheetOpen: (open: boolean) => void;
  openPairSheet: () => Promise<void>;
  disconnect: () => Promise<void>;
  leapToPhone: (id: string) => Promise<void>;
};

const CompanionContext = createContext<CompanionContextValue | null>(null);

export function useCompanion() {
  return useContext(CompanionContext);
}

export function usePhonePresence(): CompanionPresence {
  const ctx = useContext(CompanionContext);
  const [presence, setPresence] = useState<CompanionPresence>({
    paired: false,
    locations: {},
  });

  useEffect(() => {
    if (ctx) return;
    void fetchCompanionStatus().then((s) => {
      if (!s) return;
      const locations: Record<string, CompanionLocation> = {};
      for (const p of s.pets) locations[p.id] = p.location;
      setPresence({ paired: s.paired, locations });
    });
    return subscribePresence(setPresence);
  }, [ctx]);

  if (ctx) {
    return { paired: ctx.paired, locations: ctx.locations };
  }
  return presence;
}

export function CompanionProvider({
  party,
  children,
  onPocketMessage,
  onPetAsleep,
  onLeap,
  onArrived,
}: {
  party: PartyMember[];
  children: ReactNode;
  onPocketMessage?: (
    line: CompanionChatLine,
    thread: CompanionChatLine[],
    meta?: { leapTo?: "pc" | "phone" }
  ) => void;
  onPetAsleep?: (id: string) => void;
  onLeap?: (id: string, to: "pc" | "phone") => void;
  onArrived?: (id: string, location: CompanionLocation) => void;
}) {
  const [pairInfo, setPairInfo] = useState<CompanionPairInfo | null>(null);
  const [paired, setPaired] = useState(false);
  const [locations, setLocations] = useState<Record<string, CompanionLocation>>(
    {}
  );
  const [parcels, setParcels] = useState<Record<string, CompanionParcelMeta>>(
    {}
  );
  const [asleep, setAsleep] = useState<Record<string, boolean>>({});
  const [trips, setTrips] = useState<Record<string, number>>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const locationsRef = useRef(locations);
  const partyRef = useRef(party);
  const incomingRef = useRef(new Set<string>());
  const threadsRef = useRef<CompanionThreads>({});
  const onPocketMessageRef = useRef(onPocketMessage);
  onPocketMessageRef.current = onPocketMessage;
  const onPetAsleepRef = useRef(onPetAsleep);
  onPetAsleepRef.current = onPetAsleep;
  const onLeapRef = useRef(onLeap);
  onLeapRef.current = onLeap;
  const onArrivedRef = useRef(onArrived);
  onArrivedRef.current = onArrived;
  const asleepRef = useRef(new Set<string>());
  const incomingTimers = useRef<Record<string, number>>({});

  useEffect(() => {
    locationsRef.current = locations;
  }, [locations]);
  useEffect(() => {
    partyRef.current = party;
  }, [party]);

  const applyPets = useCallback(
    (
      pets: Array<{
        id: string;
        location: CompanionLocation;
        asleep?: boolean;
        trips?: number;
        parcel?: CompanionParcelMeta;
      }>,
      nextPaired: boolean
    ) => {
      const next: Record<string, CompanionLocation> = {};
      const nextParcels: Record<string, CompanionParcelMeta> = {};
      const nextAsleep: Record<string, boolean> = {};
      const nextTrips: Record<string, number> = {};
      for (const p of pets) {
        next[p.id] = p.location;
        nextAsleep[p.id] = Boolean(p.asleep);
        nextTrips[p.id] = p.trips ?? 0;
        if (p.parcel) nextParcels[p.id] = p.parcel;
        if (p.asleep && !asleepRef.current.has(p.id)) {
          asleepRef.current.add(p.id);
          onPetAsleepRef.current?.(p.id);
        }
        if (!p.asleep) asleepRef.current.delete(p.id);
      }
      setLocations(next);
      setParcels(nextParcels);
      setAsleep(nextAsleep);
      setTrips(nextTrips);
      setPaired(nextPaired);
      publishPresence({ paired: nextPaired, locations: next });
    },
    []
  );

  useEffect(() => {
    const h = window.location.hostname;
    const local = Boolean(window.petassist) || h === "localhost" || h === "127.0.0.1";
    if (!local) return;
    const close = openCompanionEvents(null, (event) => {
      if (event.type === "snapshot") {
        applyPets(event.pets, event.paired);
        if (event.threads) threadsRef.current = event.threads;
        setPairInfo((prev) =>
          prev ? { ...prev, paired: event.paired } : prev
        );
        return;
      }
      if (event.type === "paired") {
        setPaired(true);
        setPairInfo((prev) => (prev ? { ...prev, paired: true } : prev));
        return;
      }
      if (event.type === "unpaired") {
        setPaired(false);
        incomingRef.current.clear();
        threadsRef.current = {};
        asleepRef.current.clear();
        setParcels({});
        setAsleep({});
        setTrips({});
        setPairInfo((prev) => (prev ? { ...prev, paired: false } : prev));
        publishPresence({ paired: false, locations: {} });
        return;
      }
      if (event.type === "message") {
        const prev = threadsRef.current[event.petId] ?? [];
        const thread = prev.some((row) => row.msgId === event.msgId)
          ? prev
          : [...prev, event];
        threadsRef.current = { ...threadsRef.current, [event.petId]: thread };
        onPocketMessageRef.current?.(event, thread, {
          leapTo: event.leapTo,
        });
        return;
      }
      if (event.type === "leap") {
        onLeapRef.current?.(event.id, event.to);
        if (event.to === "phone") {
          const timer = incomingTimers.current[event.id];
          if (timer) {
            window.clearTimeout(timer);
            delete incomingTimers.current[event.id];
          }
          incomingRef.current.delete(event.id);
          return;
        }
        if (event.to !== "pc") return;
        if (incomingRef.current.has(event.id)) return;
        incomingRef.current.add(event.id);
        const delay = Math.max(0, event.t0 + event.overlapAt - Date.now());
        incomingTimers.current[event.id] = window.setTimeout(() => {
          delete incomingTimers.current[event.id];
          void Promise.resolve(window.petassist?.leapPet(event.id, "in"))
            .then(() => postArrived({ id: event.id, location: "pc" }))
            .finally(() => incomingRef.current.delete(event.id));
        }, delay);
        return;
      }
      if (event.type === "arrived") {
        onArrivedRef.current?.(event.id, event.location);
      }
    });
    return close;
  }, [applyPets]);

  useEffect(() => {
    const h = window.location.hostname;
    const local = Boolean(window.petassist) || h === "localhost" || h === "127.0.0.1";
    if (!local) return;
    const pets = petsFromParty(party, locationsRef.current);
    const t = window.setTimeout(() => {
      void syncCompanionPets(pets);
    }, 120);
    return () => window.clearTimeout(t);
  }, [party]);

  const openPairSheet = useCallback(async () => {
    setSheetOpen(true);
    const status = await fetchCompanionStatus().catch(() => null);
    if (status?.code || status?.paired) {
      setPairInfo(status);
      setPaired(status.paired);
      return;
    }
    const info = await pairCompanion(petsFromParty(partyRef.current, locationsRef.current));
    setPairInfo(info);
    setPaired(false);
  }, []);

  const disconnect = useCallback(async () => {
    await unpairCompanion();
    setPaired(false);
    setPairInfo(null);
    setLocations({});
    publishPresence({ paired: false, locations: {} });
  }, []);

  const leapToPhone = useCallback(async (id: string) => {
    const t0 = Date.now();
    onLeapRef.current?.(id, "phone");
    void window.petassist?.leapPet(id, "out");
    await postLeap({ id, from: "pc", to: "phone", t0 });
  }, []);

  const value = useMemo(
    () => ({
      pairInfo,
      paired,
      locations,
      parcels,
      asleep,
      trips,
      sheetOpen,
      setSheetOpen,
      openPairSheet,
      disconnect,
      leapToPhone,
    }),
    [
      pairInfo,
      paired,
      locations,
      parcels,
      asleep,
      trips,
      sheetOpen,
      openPairSheet,
      disconnect,
      leapToPhone,
    ]
  );

  return (
    <CompanionContext.Provider value={value}>
      {children}
    </CompanionContext.Provider>
  );
}
