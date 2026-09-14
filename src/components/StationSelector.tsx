import React, { useState } from 'react';
import { StationInfo } from '../types';
import { Search, MapPin, Anchor, ExternalLink, ChevronDown } from 'lucide-react';

interface StationSelectorProps {
  stations: StationInfo[];
  currentStationId: string;
  onSelectStation: (stationId: string) => void;
  isLoading?: boolean;
}

export const StationSelector: React.FC<StationSelectorProps> = ({
  stations,
  currentStationId,
  onSelectStation,
  isLoading
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [customStationId, setCustomStationId] = useState('');

  const currentStation = stations.find(s => s.id === currentStationId) || {
    id: currentStationId,
    name: `Buoy Station ${currentStationId}`,
    location: 'NOAA Marine Observation',
    lat: 0,
    lon: 0,
    description: 'NOAA buoy station'
  };

  const filteredStations = stations.filter(s =>
    s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = customStationId.trim().toUpperCase();
    if (cleanId) {
      onSelectStation(cleanId);
      setIsOpen(false);
      setCustomStationId('');
    }
  };

  return (
    <div id="station-selector-wrapper" className="relative">
      {/* Current Station Trigger Button */}
      <button
        id="station-selector-trigger"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="group flex items-center gap-3 px-3.5 py-2 rounded-xl bg-zinc-900/90 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 transition-all text-left cursor-pointer"
      >
        <div className="p-1.5 rounded-lg bg-cyan-950/60 border border-cyan-500/30 text-cyan-400">
          <Anchor className="h-4 w-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
            Active Station · {currentStation.id}
          </span>
          <span className="text-sm font-semibold text-zinc-200 group-hover:text-white line-clamp-1">
            {currentStation.name}
          </span>
        </div>
        <ChevronDown className={`h-4 w-4 text-zinc-400 ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Modal / Popover */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div
            id="station-dropdown-menu"
            className="absolute left-0 sm:right-auto sm:left-0 top-full mt-2 w-80 sm:w-96 rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl z-50 p-4 font-mono text-xs overflow-hidden backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-900">
              <span className="text-zinc-300 font-bold uppercase tracking-wider text-xs">
                Select NOAA Buoy Station
              </span>
              <a
                href="https://www.ndbc.noaa.gov"
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1 text-[11px]"
              >
                NOAA NDBC <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {/* Search Input */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Search station name or location..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-900/80 border border-zinc-800 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 text-xs"
              />
            </div>

            {/* Stations List */}
            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 mb-3 scrollbar-thin scrollbar-thumb-zinc-800">
              {filteredStations.map(station => {
                const isSelected = station.id === currentStationId;
                return (
                  <button
                    key={station.id}
                    id={`station-option-${station.id}`}
                    onClick={() => {
                      onSelectStation(station.id);
                      setIsOpen(false);
                    }}
                    className={`w-full p-2.5 rounded-lg text-left transition-all cursor-pointer flex flex-col gap-0.5 ${
                      isSelected
                        ? 'bg-cyan-950/40 border border-cyan-500/40 text-cyan-200'
                        : 'bg-zinc-900/40 hover:bg-zinc-850/80 border border-transparent text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">{station.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                        {station.id}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-zinc-400">
                      <MapPin className="h-3 w-3 text-zinc-500 shrink-0" />
                      <span className="truncate">{station.location}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Custom Station ID Input */}
            <form onSubmit={handleCustomSubmit} className="pt-3 border-t border-zinc-900 flex gap-2">
              <input
                type="text"
                placeholder="Custom NOAA ID (e.g. 46214)"
                value={customStationId}
                onChange={e => setCustomStationId(e.target.value)}
                maxLength={8}
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs focus:outline-none focus:border-cyan-500"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-black font-bold text-xs transition-colors cursor-pointer"
              >
                Load
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
};
