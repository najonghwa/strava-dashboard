import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_TABLE = import.meta.env.VITE_SUPABASE_TABLE || 'activities';
const SETTINGS_TABLE = 'dashboard_settings';
const SETTINGS_ID = 'default';

const toNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeDateTime = (value) => {
  if (!value) return new Date().toISOString();
  return String(value).replace(' ', 'T');
};

const normalizeLocalDateTime = (value) => {
  if (!value) return new Date().toISOString().replace(/(Z|[+-]\d{2}(?::?\d{2})?)$/, '');
  return String(value)
    .trim()
    .replace(' ', 'T')
    .replace(/(Z|[+-]\d{2}(?::?\d{2})?)$/, '');
};

const normalizeSupabaseActivity = (row) => {
  let raw = row.raw || {};
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = {};
    }
  }

  return {
    id: row.id,
    athlete_id: row.athlete_id,
    name: row.name || 'Activity',
    sport_type: row.sport_type || raw?.sport_type || raw?.type || 'Run',
    start_date_local: row.start_date_local
      ? normalizeLocalDateTime(row.start_date_local)
      : normalizeDateTime(row.start_date),
    distance_km: toNumber(row.distance_km, toNumber(row.distance_m) / 1000),
    moving_time: toNumber(row.moving_time),
    elapsed_time: toNumber(row.elapsed_time, toNumber(row.moving_time)),
    pace_min_per_km: toNumber(row.pace_min_per_km),
    average_speed: toNumber(row.average_speed),
    average_heartrate: toNumber(row.average_heartrate),
    max_heartrate: toNumber(row.max_heartrate),
    average_cadence: toNumber(row.average_cadence),
    average_watts: toNumber(row.average_watts),
    total_elevation_gain: toNumber(row.total_elevation_gain),
    device_name: row.device_name || 'Unknown device',
    raw,
  };
};

const fetchAllSupabaseActivities = async (supabase) => {
  const pageSize = 1000;
  let from = 0;
  let allRows = [];

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from(SUPABASE_TABLE)
      .select('*')
      .order('start_date_local', { ascending: false })
      .range(from, to);

    if (error) throw error;

    allRows = [...allRows, ...(data || [])];
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
};

const sportLabels = {
  Run: 'Running',
  Ride: 'Riding',
  VirtualRide: 'Virtual Ride',
  Swim: 'Swimming',
  Hike: 'Hiking',
  Walk: 'Walking',
  AlpineSki: 'Alpine Ski',
  NordicSki: 'Nordic Ski',
  WeightTraining: 'Weight Training',
  Workout: 'Workout',
  Yoga: 'Yoga',
};

const sportIcons = {
  Run: '🏃',
  Ride: '🚴',
  VirtualRide: '🚴',
  Swim: '🏊',
  Hike: '🥾',
  Walk: '🚶',
  AlpineSki: '🎿',
  NordicSki: '🎿',
  WeightTraining: '🏋️',
  Workout: '💪',
  Yoga: '🧘',
};

const formatSportName = (sport) => {
  return `${sportIcons[sport] || '•'} ${sportLabels[sport] || sport || 'Unknown'}`;
};

const hasPositiveNumber = (value) => Number.isFinite(value) && value > 0;

const calculateRelativeEffort = (activity) => {
  if (!hasPositiveNumber(activity.moving_time)) return 0;

  const durationMinutes = activity.moving_time / 60;
  const hr = activity.average_heartrate;
  let intensity = 0.7;

  if (hasPositiveNumber(hr)) {
    if (hr < 125) intensity = 0.7;
    else if (hr < 143) intensity = 1.0;
    else if (hr < 160) intensity = 1.7;
    else if (hr < 175) intensity = 2.6;
    else intensity = 3.6;
  } else if (hasPositiveNumber(activity.average_watts)) {
    intensity = 1.3;
  }

  return Math.round(durationMinutes * intensity);
};

const decodePolyline = (encoded = '') => {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates = [];

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push([lat / 1e5, lng / 1e5]);
  }

  return coordinates;
};

const createRoutePath = (activity) => {
  const encoded = activity?.raw?.map?.summary_polyline;
  if (!encoded) return '';

  const points = decodePolyline(encoded);
  if (points.length < 2) return '';

  const lats = points.map(([lat]) => lat);
  const lngs = points.map(([, lng]) => lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latRange = Math.max(maxLat - minLat, 0.00001);
  const lngRange = Math.max(maxLng - minLng, 0.00001);

  return points
    .map(([lat, lng], index) => {
      const x = ((lng - minLng) / lngRange) * 84 + 8;
      const y = (1 - (lat - minLat) / latRange) * 84 + 8;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
};

const getRouteCoordinates = (activity) => {
  const encoded = activity?.raw?.map?.summary_polyline;
  if (!encoded) return [];
  return decodePolyline(encoded);
};

const RouteMap = ({ activity }) => {
  const mapRef = React.useRef(null);
  const containerRef = React.useRef(null);
  const coordinates = useMemo(() => getRouteCoordinates(activity), [activity]);

  useEffect(() => {
    if (!containerRef.current || coordinates.length < 2) return;

    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;
    map.eachLayer((layer) => {
      if (layer instanceof L.Polyline || layer instanceof L.CircleMarker) {
        map.removeLayer(layer);
      }
    });

    const route = L.polyline(coordinates, {
      color: '#f97316',
      weight: 5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    L.circleMarker(coordinates[0], {
      radius: 5,
      color: '#22c55e',
      fillColor: '#22c55e',
      fillOpacity: 1,
    }).addTo(map);

    L.circleMarker(coordinates[coordinates.length - 1], {
      radius: 5,
      color: '#f43f5e',
      fillColor: '#f43f5e',
      fillOpacity: 1,
    }).addTo(map);

    map.fitBounds(route.getBounds(), { padding: [24, 24] });
    setTimeout(() => map.invalidateSize(), 0);
  }, [coordinates]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  if (coordinates.length < 2) {
    return (
      <div className="relative z-10 text-center text-sm text-slate-500">
        이 활동에는 표시할 GPS 경로가 없습니다.
      </div>
    );
  }

  return <div ref={containerRef} className="absolute inset-0 z-0" />;
};

// ==========================================
// MOCK DATA GENERATOR (Supabase 스키마 기준)
// ==========================================
const generateMockData = () => {
  const sports = ['Run', 'Ride', 'Swim', 'Hike', 'AlpineSki'];
  const data = [];
  const today = new Date();

  let idCounter = 18722577900;

  // Generate around 120 activities over the past 1.5 years (spanning 2025 and 2026)
  for (let i = 0; i < 120; i++) {
    const date = new Date();
    date.setDate(today.getDate() - i * 4 - Math.floor(Math.random() * 3));
    
    const rand = Math.random();
    let sport = 'Run';
    if (rand > 0.65 && rand <= 0.77) sport = 'Ride';
    else if (rand > 0.77 && rand <= 0.87) sport = 'Swim';
    else if (rand > 0.87 && rand <= 0.95) sport = 'Hike';
    else if (rand > 0.95) sport = 'AlpineSki';

    const start_date_local = date.toISOString().replace('T', ' ').substring(0, 19) + '+09';
    let distance_km = 0;
    let moving_time = 0;
    let average_heartrate = 0;
    let average_cadence = 0;
    let average_watts = 0;
    let total_elevation_gain = 0;

    if (sport === 'Run') {
      distance_km = parseFloat((3 + Math.random() * 18).toFixed(3)); // 3km ~ 21km
      const paceSec = 270 + Math.random() * 180; 
      moving_time = Math.round(distance_km * paceSec);
      const baseHR = 135;
      const speedFactor = (600 - paceSec) / 10; 
      average_heartrate = Math.round(baseHR + speedFactor + (Math.random() * 10 - 5));
      average_heartrate = Math.max(110, Math.min(190, average_heartrate));
      average_cadence = parseFloat((155 + Math.random() * 30).toFixed(1));
      average_watts = Math.round(180 + (70 - (paceSec/6)) * 4 + Math.random() * 30);
      total_elevation_gain = Math.round(Math.random() * 150);
    } else if (sport === 'Ride') {
      distance_km = parseFloat((15 + Math.random() * 60).toFixed(1));
      moving_time = Math.round(distance_km * 140); 
      average_heartrate = Math.round(120 + Math.random() * 30);
      average_cadence = parseFloat((75 + Math.random() * 20).toFixed(1));
      average_watts = Math.round(120 + Math.random() * 100);
      total_elevation_gain = Math.round(Math.random() * 500);
    } else if (sport === 'Swim') {
      distance_km = parseFloat((1 + Math.random() * 3).toFixed(2));
      moving_time = Math.round(distance_km * 1200); 
      average_heartrate = Math.round(110 + Math.random() * 25);
    } else { 
      distance_km = parseFloat((5 + Math.random() * 12).toFixed(1));
      moving_time = Math.round(distance_km * 900);
      average_heartrate = Math.round(100 + Math.random() * 40);
      total_elevation_gain = Math.round(100 + Math.random() * 800);
    }

    const elapsed_time = Math.round(moving_time * (1 + Math.random() * 0.1));
    const pace_min_per_km = distance_km > 0 ? (moving_time / 60) / distance_km : 0;
    const average_speed = distance_km > 0 ? (distance_km * 1000) / moving_time : 0;

    data.push({
      id: idCounter++,
      athlete_id: 14617204,
      name: `${sport === 'Run' ? 'Morning Run 🏃' : sport === 'Ride' ? 'Cycle Ride 🚴' : sport === 'Swim' ? 'Pool Swim 🏊' : 'Outdoor Activity 🌲'}`,
      sport_type: sport,
      start_date_local,
      distance_km,
      moving_time,
      elapsed_time,
      pace_min_per_km,
      average_speed,
      average_heartrate,
      max_heartrate: Math.round(average_heartrate * 1.2),
      average_cadence,
      average_watts,
      total_elevation_gain,
      device_name: 'Garmin Forerunner 955',
      raw: {
        route_quality: 'High',
        temp: Math.round(5 + Math.random() * 25)
      }
    });
  }

  return data.sort((a, b) => new Date(b.start_date_local) - new Date(a.start_date_local));
};

const generateMapPath = (id) => {
  const seed = id % 5;
  if (seed === 0) return "M 10 80 Q 52.5 10, 95 80 T 180 80";
  if (seed === 1) return "M 20 20 C 20 20, 150 10, 150 80 C 150 150, 50 130, 20 20";
  if (seed === 2) return "M 10 80 L 50 20 L 90 80 L 130 20 L 170 80";
  if (seed === 3) return "M 30 30 Q 150 20, 120 120 T 30 30";
  return "M 10 50 A 40 40 0 1 0 90 50 A 40 40 0 1 0 10 50";
};

export default function App() {
  const [activities, setActivities] = useState([]);
  const [selectedSport, setSelectedSport] = useState('All');
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(null);
  const [calendarModalActivity, setCalendarModalActivity] = useState(null);
  const [routeActivity, setRouteActivity] = useState(null);
  const [yearlyGoal, setYearlyGoal] = useState(1000);
  const [monthlyGoal, setMonthlyGoal] = useState(100);
  const [goalDraft, setGoalDraft] = useState('1000');
  const [monthlyGoalDraft, setMonthlyGoalDraft] = useState('100');
  const [goalSaveStatus, setGoalSaveStatus] = useState('');
  const [supabaseUrl, setSupabaseUrl] = useState(SUPABASE_URL);
  const [supabaseKey, setSupabaseKey] = useState(SUPABASE_ANON_KEY);
  const [isConnected, setIsConnected] = useState(false);
  const [dataSource, setDataSource] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard'); 
  const [dashboardSubTab, setDashboardSubTab] = useState('overview');
  const [showAllSports, setShowAllSports] = useState(false);
  const [routeSearchTerm, setRouteSearchTerm] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Form states for manually adding test runs
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRunDistance, setNewRunDistance] = useState('5.0');
  const [newRunPace, setNewRunPace] = useState('5:30');
  const [newRunHR, setNewRunHR] = useState('145');
  const [newRunCadence, setNewRunCadence] = useState('172');
  const [newRunDate, setNewRunDate] = useState(new Date().toISOString().substring(0, 10));

  const selectedRoutePath = useMemo(() => createRoutePath(routeActivity), [routeActivity]);

  const routeActivities = useMemo(() => {
    return activities
      .filter(activity => activity.raw?.map?.summary_polyline);
  }, [activities]);

  const filteredRouteActivities = useMemo(() => {
    const keyword = routeSearchTerm.trim().toLowerCase();
    if (!keyword) return routeActivities;
    return routeActivities.filter(activity =>
      String(activity.name || '').toLowerCase().includes(keyword) ||
      String(activity.device_name || '').toLowerCase().includes(keyword) ||
      String(formatSportName(activity.sport_type) || '').toLowerCase().includes(keyword)
    );
  }, [routeActivities, routeSearchTerm]);

  const loadSupabaseActivities = async (url = SUPABASE_URL, key = SUPABASE_ANON_KEY, showAlert = false) => {
    if (!url || !key) {
      setActivities([]);
      setIsConnected(false);
      setDataSource('error');
      setLoadError('Vercel 환경변수 VITE_SUPABASE_URL 또는 VITE_SUPABASE_ANON_KEY가 없어 DB 데이터를 불러올 수 없습니다.');
      return;
    }

    try {
      setDataSource('loading');
      setLoadError('');
      const supabase = createClient(url, key);
      const data = await fetchAllSupabaseActivities(supabase);
      const normalizedActivities = (data || []).map(normalizeSupabaseActivity);
      const { data: settingsData, error: settingsError } = await supabase
        .from(SETTINGS_TABLE)
        .select('yearly_goal, monthly_goal')
        .eq('id', SETTINGS_ID)
        .maybeSingle();

      if (!settingsError && settingsData) {
        const savedGoal = Number(settingsData.yearly_goal);
        if (Number.isFinite(savedGoal) && savedGoal > 0) {
          setYearlyGoal(savedGoal);
          setGoalDraft(String(savedGoal));
          const savedMonthlyGoal = Number(settingsData.monthly_goal);
          if (Number.isFinite(savedMonthlyGoal) && savedMonthlyGoal > 0) {
            setMonthlyGoal(savedMonthlyGoal);
            setMonthlyGoalDraft(String(savedMonthlyGoal));
          }
          setGoalSaveStatus('저장된 목표를 불러왔습니다.');
        }
      }

      setActivities(normalizedActivities);
      setRouteActivity(normalizedActivities.find(activity => activity.raw?.map?.summary_polyline) || normalizedActivities[0] || null);
      setIsConnected(true);
      setDataSource('supabase');
    } catch (error) {
      console.error('Failed to load DB activities:', error);
      setActivities([]);
      setIsConnected(false);
      setDataSource('error');
      setLoadError(error?.message || 'DB 데이터를 불러오지 못했습니다.');
      if (showAlert) {
        alert('DB 데이터를 불러오지 못했습니다. URL, anon key, 테이블 이름, RLS 정책을 확인해주세요.');
      }
    }
  };

  useEffect(() => {
    loadSupabaseActivities();
  }, []);

  // Format Helper functions
  const formatPace = (paceDecimal) => {
    if (!paceDecimal || isNaN(paceDecimal)) return '0:00';
    const totalSeconds = Math.round(paceDecimal * 60);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const formatDuration = (sec) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    if (hrs > 0) {
      return `${hrs}시간 ${mins}분`;
    }
    return `${mins}분`;
  };

  // Filter activities
  const filteredActivities = useMemo(() => {
    return activities.filter(act => {
      const matchSport = selectedSport === 'All' || act.sport_type === selectedSport;
      return matchSport;
    });
  }, [activities, selectedSport]);

  // Determine the dynamic active analysis year from loaded activities
  const activeAnalysisYear = useMemo(() => {
    if (activities.length === 0) return new Date().getFullYear();
    const years = activities
      .map(a => {
        const d = new Date(a.start_date_local);
        return d ? d.getFullYear() : null;
      })
      .filter(y => y && !isNaN(y));
    return years.length > 0 ? Math.max(...years) : new Date().getFullYear();
  }, [activities]);

  // Statistics Calculation (Based on active dynamic year)
  const stats = useMemo(() => {
    const runsWithPace = activities.filter(a => a.sport_type === 'Run' && hasPositiveNumber(a.pace_min_per_km));
    const runsWithHR = activities.filter(a => a.sport_type === 'Run' && hasPositiveNumber(a.average_heartrate));
    const totalCount = filteredActivities.length;
    const totalDistance = filteredActivities.reduce((sum, a) => sum + a.distance_km, 0);
    const totalTime = filteredActivities.reduce((sum, a) => sum + a.moving_time, 0);
    
    // YTD calculation dynamically based on the latest available year in data
    const ytdDistance = filteredActivities
      .filter(a => new Date(a.start_date_local).getFullYear() === activeAnalysisYear)
      .reduce((sum, a) => sum + a.distance_km, 0);

    // Running Pace & HR calculation
    const runningPaceSum = runsWithPace.reduce((sum, a) => sum + a.pace_min_per_km, 0);
    const avgRunningPaceDecimal = runsWithPace.length > 0 ? runningPaceSum / runsWithPace.length : 0;
    
    const runningHRSum = runsWithHR.reduce((sum, a) => sum + a.average_heartrate, 0);
    const avgRunningHR = runsWithHR.length > 0 ? Math.round(runningHRSum / runsWithHR.length) : 0;

    return {
      totalCount,
      totalDistance: parseFloat(totalDistance.toFixed(1)),
      totalTime: Math.round(totalTime / 3600), 
      ytdDistance: parseFloat(ytdDistance.toFixed(1)),
      avgPace: formatPace(avgRunningPaceDecimal),
      avgHR: avgRunningHR
    };
  }, [filteredActivities, activities, activeAnalysisYear]);

  const subscriptionStyleInsights = useMemo(() => {
    const validActivities = activities
      .filter(a => a.start_date_local && hasPositiveNumber(a.moving_time))
      .map(a => ({
        ...a,
        date: new Date(a.start_date_local),
        relativeEffort: calculateRelativeEffort(a),
      }))
      .filter(a => !Number.isNaN(a.date.getTime()))
      .sort((a, b) => a.date - b.date);

    if (validActivities.length === 0) {
      return {
        currentWeekEffort: 0,
        previousWeekEffort: 0,
        effortChange: 0,
        fitness: 0,
        fatigue: 0,
        form: 0,
        formLabel: '데이터 없음',
        monthDistance: 0,
        prevMonthDistance: 0,
        monthDistanceChange: 0,
        monthTime: 0,
        monthElevation: 0,
        paceZoneEasy: 0,
        paceZoneSteady: 0,
        paceZoneHard: 0,
        rampRate: 0,
        riskLabel: '데이터 없음',
        matchedRouteName: 'N/A',
        matchedRouteLatest: 'N/A',
        matchedRouteBest: 'N/A',
        matchedRouteDelta: 0,
        powerCoverage: 0,
        avgPower: 0,
        terrainAdjustedPace: '0:00',
      };
    }

    const latestDate = validActivities[validActivities.length - 1].date;
    const daysBetween = (date) => Math.floor((latestDate - date) / (1000 * 60 * 60 * 24));
    const currentWeek = validActivities.filter(a => daysBetween(a.date) >= 0 && daysBetween(a.date) < 7);
    const previousWeek = validActivities.filter(a => daysBetween(a.date) >= 7 && daysBetween(a.date) < 14);
    const currentWeekEffort = currentWeek.reduce((sum, a) => sum + a.relativeEffort, 0);
    const previousWeekEffort = previousWeek.reduce((sum, a) => sum + a.relativeEffort, 0);
    const effortChange = previousWeekEffort > 0
      ? Math.round(((currentWeekEffort - previousWeekEffort) / previousWeekEffort) * 100)
      : 0;
    const priorThreeWeeks = validActivities.filter(a => daysBetween(a.date) >= 7 && daysBetween(a.date) < 28);
    const priorWeeklyEffort = priorThreeWeeks.reduce((sum, a) => sum + a.relativeEffort, 0) / 3;
    const rampRate = priorWeeklyEffort > 0
      ? Math.round(((currentWeekEffort - priorWeeklyEffort) / priorWeeklyEffort) * 100)
      : 0;
    const riskLabel = rampRate > 35 ? '부상 위험 높음' : rampRate > 15 ? '부하 증가 주의' : rampRate < -25 ? '회복/감량 주간' : '안정적';

    let fitness = 0;
    let fatigue = 0;
    validActivities.forEach((activity) => {
      fitness = fitness * Math.exp(-1 / 42) + activity.relativeEffort * 0.08;
      fatigue = fatigue * Math.exp(-1 / 7) + activity.relativeEffort * 0.18;
    });
    const roundedFitness = Math.round(fitness);
    const roundedFatigue = Math.round(fatigue);
    const form = roundedFitness - roundedFatigue;
    const formLabel = form >= 8 ? '회복 양호' : form >= -10 ? '훈련 균형' : '피로 누적';

    const currentMonth = latestDate.getMonth();
    const currentYear = latestDate.getFullYear();
    const prevMonthDate = new Date(currentYear, currentMonth - 1, 1);
    const prevMonth = prevMonthDate.getMonth();
    const prevMonthYear = prevMonthDate.getFullYear();
    const monthActivities = validActivities.filter(a => a.date.getFullYear() === currentYear && a.date.getMonth() === currentMonth);
    const prevMonthActivities = validActivities.filter(a => a.date.getFullYear() === prevMonthYear && a.date.getMonth() === prevMonth);
    const monthDistance = monthActivities.reduce((sum, a) => sum + a.distance_km, 0);
    const prevMonthDistance = prevMonthActivities.reduce((sum, a) => sum + a.distance_km, 0);
    const monthDistanceChange = prevMonthDistance > 0
      ? Math.round(((monthDistance - prevMonthDistance) / prevMonthDistance) * 100)
      : 0;

    const runPaces = validActivities
      .filter(a => a.sport_type === 'Run' && hasPositiveNumber(a.pace_min_per_km))
      .map(a => a.pace_min_per_km);
    const zoneTotal = runPaces.length || 1;
    const paceZoneEasy = Math.round((runPaces.filter(p => p >= 6.5).length / zoneTotal) * 100);
    const paceZoneSteady = Math.round((runPaces.filter(p => p >= 5.3 && p < 6.5).length / zoneTotal) * 100);
    const paceZoneHard = Math.max(0, 100 - paceZoneEasy - paceZoneSteady);
    const runActivities = validActivities.filter(a => a.sport_type === 'Run' && hasPositiveNumber(a.distance_km) && hasPositiveNumber(a.pace_min_per_km));
    const terrainPaces = runActivities.map(a => {
      const climbPerKm = hasPositiveNumber(a.total_elevation_gain) ? a.total_elevation_gain / a.distance_km : 0;
      const adjustment = Math.min(0.18, climbPerKm * 0.003);
      return a.pace_min_per_km * (1 - adjustment);
    });
    const terrainAdjustedPace = terrainPaces.length
      ? formatPace(terrainPaces.reduce((sum, pace) => sum + pace, 0) / terrainPaces.length)
      : '0:00';

    const powerActivities = validActivities.filter(a => hasPositiveNumber(a.average_watts));
    const powerCoverage = Math.round((powerActivities.length / validActivities.length) * 100);
    const avgPower = powerActivities.length
      ? Math.round(powerActivities.reduce((sum, a) => sum + a.average_watts, 0) / powerActivities.length)
      : 0;

    const routeGroups = {};
    runActivities.forEach((activity) => {
      const distanceBucket = Math.round(activity.distance_km * 2) / 2;
      const key = `${activity.name || 'Run'}-${distanceBucket}`;
      routeGroups[key] = routeGroups[key] || [];
      routeGroups[key].push(activity);
    });
    const matchedGroup = Object.values(routeGroups)
      .filter(group => group.length >= 3)
      .sort((a, b) => b[0].date - a[0].date)[0] || [];
    const matchedLatest = matchedGroup.length
      ? [...matchedGroup].sort((a, b) => b.date - a.date)[0]
      : null;
    const matchedBest = matchedGroup.length
      ? [...matchedGroup].sort((a, b) => a.pace_min_per_km - b.pace_min_per_km)[0]
      : null;
    const matchedRouteDelta = matchedLatest && matchedBest
      ? Math.round((matchedLatest.pace_min_per_km - matchedBest.pace_min_per_km) * 60)
      : 0;

    return {
      currentWeekEffort,
      previousWeekEffort,
      effortChange,
      fitness: roundedFitness,
      fatigue: roundedFatigue,
      form,
      formLabel,
      monthDistance: parseFloat(monthDistance.toFixed(1)),
      prevMonthDistance: parseFloat(prevMonthDistance.toFixed(1)),
      monthDistanceChange,
      monthTime: Math.round(monthActivities.reduce((sum, a) => sum + a.moving_time, 0) / 3600),
      monthElevation: Math.round(monthActivities.reduce((sum, a) => sum + a.total_elevation_gain, 0)),
      paceZoneEasy,
      paceZoneSteady,
      paceZoneHard,
      rampRate,
      riskLabel,
      matchedRouteName: matchedLatest ? `${matchedLatest.name} · ${matchedLatest.distance_km.toFixed(1)}km` : '반복 코스 부족',
      matchedRouteLatest: matchedLatest ? formatPace(matchedLatest.pace_min_per_km) : 'N/A',
      matchedRouteBest: matchedBest ? formatPace(matchedBest.pace_min_per_km) : 'N/A',
      matchedRouteDelta,
      powerCoverage,
      avgPower,
      terrainAdjustedPace,
    };
  }, [activities]);

  // 1. Monthly Running distance calculation for Active Dynamic Year
  const monthlyDistanceData = useMemo(() => {
    const months = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
    const monthlyTotals = Array(12).fill(0);

    activities
      .filter(a => a.sport_type === 'Run' && new Date(a.start_date_local).getFullYear() === activeAnalysisYear)
      .forEach(a => {
        const monthIndex = new Date(a.start_date_local).getMonth();
        monthlyTotals[monthIndex] += a.distance_km;
      });

    return months.map((month, idx) => ({
      month,
      distance: parseFloat(monthlyTotals[idx].toFixed(1))
    }));
  }, [activities, activeAnalysisYear]);

  // 2. Weekly Distance Heatmap calculations
  const heatmapData = useMemo(() => {
    const weeks = Array(15).fill(0).map(() => Array(7).fill(null));
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const currentDayOfWeek = today.getDay(); 
    const totalDaysToShow = 15 * 7;
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (totalDaysToShow - 1 - (6 - currentDayOfWeek)));

    for (let w = 0; w < 15; w++) {
      for (let d = 0; d < 7; d++) {
        const dayOffset = w * 7 + d;
        const currentCellDate = new Date(startDate);
        currentCellDate.setDate(startDate.getDate() + dayOffset);
        
        const dayRuns = activities.filter(a => {
          const actDate = new Date(a.start_date_local);
          return actDate.getFullYear() === currentCellDate.getFullYear() &&
                 actDate.getMonth() === currentCellDate.getMonth() &&
                 actDate.getDate() === currentCellDate.getDate() &&
                 a.sport_type === 'Run';
        });

        const distanceSum = dayRuns.reduce((sum, r) => sum + r.distance_km, 0);
        weeks[w][d] = {
          date: currentCellDate,
          distance: parseFloat(distanceSum.toFixed(1)),
          runs: dayRuns
        };
      }
    }
    return weeks;
  }, [activities]);

  const calendarCells = useMemo(() => {
    const [year, month] = calendarMonth.split('-').map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const leadingEmptyDays = firstDay.getDay();
    const totalCells = Math.ceil((leadingEmptyDays + lastDay.getDate()) / 7) * 7;

    return Array(totalCells).fill(null).map((_, idx) => {
      const dayNum = idx - leadingEmptyDays + 1;
      if (dayNum < 1 || dayNum > lastDay.getDate()) {
        return { date: null, activities: [] };
      }

      const date = new Date(year, month - 1, dayNum);
      const dayActivities = activities.filter(a => {
        const activityDate = new Date(a.start_date_local);
        return activityDate.getFullYear() === year &&
          activityDate.getMonth() === month - 1 &&
          activityDate.getDate() === dayNum;
      });

      return {
        date,
        activities: dayActivities,
      };
    });
  }, [activities, calendarMonth]);

  const calendarMonthLabel = useMemo(() => {
    const [year, month] = calendarMonth.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
  }, [calendarMonth]);

  // 3. Sport Type ratio calculation
  const sportRatio = useMemo(() => {
    const counts = {};
    activities.forEach(a => {
      counts[a.sport_type] = (counts[a.sport_type] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [activities]);

  const sportFilterOptions = useMemo(() => {
    return ['All', ...sportRatio.map(item => item.name)];
  }, [sportRatio]);

  const visibleSportFilterOptions = useMemo(() => {
    if (showAllSports || sportFilterOptions.length <= 7) return sportFilterOptions;
    const primaryOptions = sportFilterOptions.slice(0, 7);
    return selectedSport !== 'All' && !primaryOptions.includes(selectedSport)
      ? [...primaryOptions, selectedSport]
      : primaryOptions;
  }, [showAllSports, sportFilterOptions, selectedSport]);

  // 4. Pace Progression over time (Running Only)
  const paceHistory = useMemo(() => {
    return activities
      .filter(a => a.sport_type === 'Run' && hasPositiveNumber(a.pace_min_per_km))
      .slice(0, 20)
      .reverse()
      .map(a => ({
        date: new Date(a.start_date_local).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
        pace: parseFloat(a.pace_min_per_km.toFixed(2)),
        paceStr: formatPace(a.pace_min_per_km)
      }));
  }, [activities]);

  const paceChartPoints = useMemo(() => {
    if (paceHistory.length === 0) return [];
    const paces = paceHistory.map(h => h.pace).filter(p => Number.isFinite(p));
    const minPace = Math.min(...paces);
    const maxPace = Math.max(...paces);
    const range = Math.max(maxPace - minPace, 1);

    return paceHistory.map((h, idx) => {
      const x = paceHistory.length === 1 ? 50 : (idx / (paceHistory.length - 1)) * 90 + 5;
      const y = ((h.pace - minPace) / range) * 70 + 15;
      return { ...h, x, y };
    });
  }, [paceHistory]);

  const pacePointsString = useMemo(() => {
    return paceChartPoints.map(point => `${point.x},${point.y}`).join(" ");
  }, [paceChartPoints]);

  const paceChartLabels = useMemo(() => {
    if (paceChartPoints.length === 0) {
      return { fast: '0:00', mid: '0:00', slow: '0:00' };
    }
    const paces = paceChartPoints.map(point => point.pace);
    const fast = Math.min(...paces);
    const slow = Math.max(...paces);
    const mid = (fast + slow) / 2;
    return {
      fast: formatPace(fast),
      mid: formatPace(mid),
      slow: formatPace(slow),
    };
  }, [paceChartPoints]);

  // 5. Heart Rate vs Pace Scatter Plot points
  const hrVsPacePoints = useMemo(() => {
    const points = activities
      .filter(a => a.sport_type === 'Run' && hasPositiveNumber(a.average_heartrate) && hasPositiveNumber(a.pace_min_per_km))
      .slice(0, 18)
      .map(a => {
        const speedKmh = 60 / a.pace_min_per_km;
        const elevationPerKm = hasPositiveNumber(a.distance_km) ? (a.total_elevation_gain || 0) / a.distance_km : 0;
        return {
          id: a.id,
          name: a.name,
          date: new Date(a.start_date_local).toLocaleDateString(),
          hr: Math.round(a.average_heartrate),
          pace: a.pace_min_per_km,
          paceStr: formatPace(a.pace_min_per_km),
          distance: a.distance_km,
          speedKmh,
          isOutlier: a.pace_min_per_km < 4.2 || a.pace_min_per_km > 9.5 || elevationPerKm > 35
        };
      });

    if (points.length === 0) return [];

    const normalPoints = points.filter(point => !point.isOutlier);
    const scalePoints = normalPoints.length >= 5 ? normalPoints : points;
    const hrs = scalePoints.map(point => point.hr);
    const paces = scalePoints.map(point => point.pace);
    const minHr = Math.min(...hrs);
    const maxHr = Math.max(...hrs);
    const minPace = Math.min(...paces);
    const maxPace = Math.max(...paces);
    const hrRange = Math.max(maxHr - minHr, 1);
    const paceRange = Math.max(maxPace - minPace, 1);

    return points.map(point => ({
      ...point,
      x: ((point.hr - minHr) / hrRange) * 80 + 10,
      y: ((point.pace - minPace) / paceRange) * 70 + 15,
      minHr,
      maxHr,
      minPace,
      maxPace,
    }));
  }, [activities]);

  const hrPaceLabels = useMemo(() => {
    if (hrVsPacePoints.length === 0) {
      return { lowHr: 0, highHr: 0, fast: '0:00', slow: '0:00' };
    }
    return {
      lowHr: Math.round(hrVsPacePoints[0].minHr),
      highHr: Math.round(hrVsPacePoints[0].maxHr),
      fast: formatPace(hrVsPacePoints[0].minPace),
      slow: formatPace(hrVsPacePoints[0].maxPace),
    };
  }, [hrVsPacePoints]);

  // 6. Running Efficiency Score Calculation
  const efficiencyTrends = useMemo(() => {
    const runs = activities
      .filter(a => a.sport_type === 'Run' && hasPositiveNumber(a.average_heartrate) && hasPositiveNumber(a.pace_min_per_km))
      .slice(0, 30);
    const scoreMap = runs.map(a => {
      const speedKmh = 60 / a.pace_min_per_km;
      const score = parseFloat(((speedKmh * 100) / a.average_heartrate).toFixed(2));
      return { id: a.id, score, date: new Date(a.start_date_local) };
    });

    const now = new Date();
    const last30 = scoreMap.filter(s => (now - s.date) / (1000 * 3600 * 24) <= 30);
    const last90 = scoreMap.filter(s => (now - s.date) / (1000 * 3600 * 24) <= 90);
    const lastYear = scoreMap.filter(s => (now - s.date) / (1000 * 3600 * 24) <= 365);

    const avgScore = (arr) => arr.length ? parseFloat((arr.reduce((sum, item) => sum + item.score, 0) / arr.length).toFixed(2)) : 0;

    return {
      last30: avgScore(last30),
      last90: avgScore(last90),
      lastYear: avgScore(lastYear),
      current: scoreMap[0]?.score || 0
    };
  }, [activities]);

  // 7. Zone Heart Rate Distribution
  const zoneDistribution = useMemo(() => {
    let z1 = 0, z2 = 0, z3 = 0, z4 = 0, z5 = 0;
    const runs = activities.filter(a => a.sport_type === 'Run' && hasPositiveNumber(a.average_heartrate));
    runs.forEach(a => {
      const hr = a.average_heartrate;
      if (hr < 125) z1++;
      else if (hr < 143) z2++;
      else if (hr < 160) z3++;
      else if (hr < 175) z4++;
      else z5++;
    });
    const total = runs.length || 1;
    return {
      z1: Math.round((z1 / total) * 100),
      z2: Math.round((z2 / total) * 100),
      z3: Math.round((z3 / total) * 100),
      z4: Math.round((z4 / total) * 100),
      z5: Math.round((z5 / total) * 100),
    };
  }, [activities]);

  // 8. Personal Bests (PBs) Tracking
  const pbRecords = useMemo(() => {
    const runs = activities
      .filter(a =>
        a.sport_type === 'Run' &&
        hasPositiveNumber(a.distance_km) &&
        hasPositiveNumber(a.moving_time) &&
        hasPositiveNumber(a.pace_min_per_km) &&
        a.pace_min_per_km >= 3 &&
        a.pace_min_per_km <= 12
      )
      .sort((a, b) => new Date(b.start_date_local).getTime() - new Date(a.start_date_local).getTime());

    const absoluteNewestRunId = runs[0]?.id;

    const getBest = (targetDist: number, minEligibleDist: number, maxEligibleDist: number) => {
      const candidates = runs.filter(r => r.distance_km >= minEligibleDist && r.distance_km <= maxEligibleDist);
      if (!candidates.length) return null;
      return [...candidates].sort((a, b) => {
        const aPace = a.moving_time / a.distance_km;
        const bPace = b.moving_time / b.distance_km;
        return aPace - bPace;
      })[0];
    };

    const makeRecord = (name: string, targetDist: number, minEligibleDist: number, maxEligibleDist: number) => {
      const best = getBest(targetDist, minEligibleDist, maxEligibleDist);
      const projectedSeconds = best ? best.moving_time * (targetDist / best.distance_km) : null;
      const projectedPace = projectedSeconds ? projectedSeconds / 60 / targetDist : null;
      return {
        name,
        time: projectedSeconds ? formatDuration(projectedSeconds) : 'N/A',
        pace: projectedPace ? `${formatPace(projectedPace)} /km` : 'N/A',
        isNew: best?.id === absoluteNewestRunId,
        raw: best,
        note: best ? `${best.distance_km.toFixed(1)}km 활동 기준` : '기록 없음',
      };
    };

    return [
      makeRecord('1 km', 1.0, 0.9, 1.6),
      makeRecord('3 km', 3.0, 2.8, 3.6),
      makeRecord('5 km', 5.0, 4.7, 6.0),
      makeRecord('10 km', 10.0, 9.5, 11.5),
      makeRecord('Half Marathon', 21.0975, 20.5, 23.0),
      makeRecord('Marathon', 42.195, 41.0, 44.5),
    ];
  }, [activities]);

  // 11. AI Running Coach Custom Logic
  const aiCoachFeedback = useMemo(() => {
    const runs = activities.filter(a => a.sport_type === 'Run');
    if (runs.length < 5) return { summary: '분석을 진행하기에 충분한 운동 데이터가 없습니다. 러닝 데이터를 더 입력해주세요!' };

    const recent4Weeks = runs.slice(0, 10);
    const previous4Weeks = runs.slice(10, 20);

    const recentDistSum = recent4Weeks.reduce((sum, r) => sum + r.distance_km, 0);
    const prevDistSum = previous4Weeks.reduce((sum, r) => sum + r.distance_km, 0);

    const recentWeeklyAvg = parseFloat((recentDistSum / 4).toFixed(1));
    const prevWeeklyAvg = parseFloat((prevDistSum / 4).toFixed(1));

    const percentChange = prevWeeklyAvg > 0 ? Math.round(((recentWeeklyAvg - prevWeeklyAvg) / prevWeeklyAvg) * 100) : 0;

    const recentHR = recent4Weeks.reduce((sum, r) => sum + r.average_heartrate, 0) / recent4Weeks.length;
    const prevHR = previous4Weeks.reduce((sum, r) => sum + r.average_heartrate, 0) / previous4Weeks.length;

    let hrAnalysis = "심박 편차가 크지 않은 유산소 페이스를 잘 유지하고 있습니다.";
    if (recentHR < prevHR - 2) {
      hrAnalysis = "최근 동일 강도 대비 평균 심박수가 감소하고 있으며, 심혈관 및 유산소 효율성이 확연히 향상되는 긍정적 지표를 보입니다.";
    } else if (recentHR > prevHR + 2) {
      hrAnalysis = "동일 페이스 대비 최근 심박수가 상승했습니다. 피로 누적이나 날씨 변화(고온)로 인한 영향일 수 있으니 회복 러닝 비율을 늘리세요.";
    }

    let mileageRec = `다음 4주간은 주당 ${Math.round(recentWeeklyAvg * 1.1)}km 수준으로 마일리지를 10% 이내로 서서히 올리는 것을 목표로 잡는 것을 추천합니다.`;
    if (percentChange > 25) {
      mileageRec = "경고: 최근 주간 마일리지가 급격히 상승했습니다(부상 주의 구간). 향후 2주간은 마일리지를 소폭 줄이고 부하 적응에 집중하세요.";
    }

    return {
      recentWeeklyAvg,
      percentChange,
      hrAnalysis,
      mileageRec,
      efficiencyTip: "Zone 2 회복 유산소 러닝 비율을 70% 이상 유지할 때 심폐 기초 체력이 가장 안정적으로 진화합니다."
    };
  }, [activities]);

  // Handle Manual Add Activity (Simulation of Supabase Insertion)
  const handleAddRun = (e) => {
    e.preventDefault();
    const dist = parseFloat(newRunDistance);
    const parts = newRunPace.split(':');
    const mins = parseInt(parts[0], 10);
    const secs = parseInt(parts[1] || 0, 10);
    const paceDecimal = mins + secs / 60;
    const movingTime = Math.round(dist * paceDecimal * 60);
    const hr = parseInt(newRunHR, 10);
    const cadence = parseFloat(newRunCadence);

    const newActivity = {
      id: Date.now(),
      athlete_id: 14617204,
      name: "임시 러닝 테스트 (수파베이스 동기화 시뮬레이션) 👟",
      sport_type: "Run",
      start_date_local: `${newRunDate} 08:30:00+09`,
      distance_km: dist,
      moving_time: movingTime,
      elapsed_time: Math.round(movingTime * 1.05),
      pace_min_per_km: paceDecimal,
      average_speed: (dist * 1000) / movingTime,
      average_heartrate: hr,
      max_heartrate: Math.round(hr * 1.25),
      average_cadence: cadence,
      average_watts: Math.round(230 + (180 - cadence) * 3),
      total_elevation_gain: Math.round(Math.random() * 45),
      device_name: "Garmin Forerunner 955",
      raw: { route_quality: 'Premium Verified' }
    };

    setActivities([newActivity, ...activities]);
    setShowAddModal(false);
  };

  const handleConnectSupabase = () => {
    if (!supabaseUrl || !supabaseKey) {
      alert("DB URL과 API Key를 입력해주십시오.");
      return;
    }
    loadSupabaseActivities(supabaseUrl, supabaseKey, true);
  };

  const handleSaveYearlyGoal = async () => {
    const nextGoal = Number(goalDraft);
    if (!Number.isFinite(nextGoal) || nextGoal <= 0) {
      setGoalSaveStatus('1 이상의 숫자를 입력해주세요.');
      return;
    }

    if (!supabaseUrl || !supabaseKey) {
      setYearlyGoal(nextGoal);
      setGoalSaveStatus('DB 연결 정보가 없어 화면에만 반영되었습니다.');
      return;
    }

    try {
      setGoalSaveStatus('저장 중...');
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { error } = await supabase
        .from(SETTINGS_TABLE)
        .upsert({
          id: SETTINGS_ID,
          yearly_goal: nextGoal,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      setYearlyGoal(nextGoal);
      setGoalSaveStatus('DB에 저장되었습니다.');
    } catch (error) {
      console.error('Failed to save yearly goal:', error);
      setGoalSaveStatus('저장 실패: dashboard_settings 테이블과 권한을 확인해주세요.');
    }
  };

  const handleSaveMonthlyGoal = async () => {
    const nextGoal = Number(monthlyGoalDraft);
    if (!Number.isFinite(nextGoal) || nextGoal <= 0) {
      setGoalSaveStatus('월간 목표는 1 이상의 숫자로 입력해주세요.');
      return;
    }

    if (!supabaseUrl || !supabaseKey) {
      setMonthlyGoal(nextGoal);
      setGoalSaveStatus('DB 연결 정보가 없어 화면에만 반영되었습니다.');
      return;
    }

    try {
      setGoalSaveStatus('저장 중...');
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { error } = await supabase
        .from(SETTINGS_TABLE)
        .upsert({
          id: SETTINGS_ID,
          monthly_goal: nextGoal,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      setMonthlyGoal(nextGoal);
      setGoalSaveStatus('월간 목표가 DB에 저장되었습니다.');
    } catch (error) {
      console.error('Failed to save monthly goal:', error);
      setGoalSaveStatus('저장 실패: dashboard_settings 테이블과 권한을 확인해주세요.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      
      {/* Top Banner & Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-orange-500 text-white px-3 py-2 rounded-lg font-black tracking-wider flex items-center justify-center">
              LOG
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                Training Dashboard
              </h1>
              <p className="text-xs text-slate-400">개인 운동 기록과 훈련 흐름을 한눈에 확인합니다</p>
            </div>
          </div>

          {/* Nav Navigation tabs */}
          <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-sm">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-1.5 rounded-md font-medium transition ${activeTab === 'dashboard' ? 'bg-orange-500 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
            >
              종합 대시보드
            </button>
            <button
              onClick={() => setActiveTab('activity_list')}
              className={`px-4 py-1.5 rounded-md font-medium transition ${activeTab === 'activity_list' ? 'bg-orange-500 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
            >
              운동 로그 목록
            </button>
            <button
              onClick={() => setActiveTab('supabase_guide')}
              className={`px-4 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ${activeTab === 'supabase_guide' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              DB 연동설정
            </button>
          </div>

          <div className="flex items-center gap-2" />
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {dataSource !== 'supabase' && (
          <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
            dataSource === 'error'
              ? 'border-rose-500/40 bg-rose-950/40 text-rose-100'
              : 'border-amber-500/40 bg-amber-950/30 text-amber-100'
          }`}>
            <div className="font-semibold">
              {dataSource === 'loading' && 'DB 데이터를 불러오는 중입니다.'}
              {dataSource === 'error' && 'DB 연결에 실패했습니다.'}
            </div>
            {loadError && <div className="mt-1 text-xs opacity-90">{loadError}</div>}
          </div>
        )}

        {/* Global Filter Bar */}
        <div className="mb-6 p-3 bg-slate-900 rounded-xl border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-bold uppercase tracking-wider text-slate-500">운동 종목</span>
            {visibleSportFilterOptions.map((sport) => (
              <button
                key={sport}
                onClick={() => setSelectedSport(sport)}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                  selectedSport === sport
                    ? 'bg-slate-100 text-slate-900'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {sport === 'All' ? '전체' : formatSportName(sport)}
              </button>
            ))}
            {sportFilterOptions.length > 7 && (
              <button
                onClick={() => setShowAllSports(!showAllSports)}
                className="rounded-full bg-slate-950 px-3 py-1 text-xs font-bold text-slate-300 border border-slate-800 hover:border-slate-600 hover:text-white transition"
              >
                {showAllSports ? '접기' : `+${sportFilterOptions.length - 7}`}
              </button>
            )}
          </div>

        </div>

        {activeTab === 'supabase_guide' && (
          <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-emerald-500 text-slate-950 p-2 rounded-lg font-bold">DB</div>
              <h2 className="text-xl font-bold">내 DB와 연결하기</h2>
            </div>
            <p className="text-slate-300 text-sm mb-6 leading-relaxed">
              사용 중인 DB 프로젝트의 API 자격 증명을 사용하여 실시간으로 데이터를 로드할 수 있습니다. 
              DB 테이블 이름이 아래 스키마 구조와 대응하는지 확인해 보십시오.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="space-y-4">
                <h3 className="font-semibold text-orange-400 border-b border-slate-800 pb-2">연동 자격 증명 설정</h3>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">DB URL</label>
                  <input
                    type="text"
                    placeholder="https://your-project.supabase.co"
                    value={supabaseUrl}
                    onChange={(e) => setSupabaseUrl(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-sm rounded-lg p-2.5 text-slate-300 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">DB ANON KEY</label>
                  <input
                    type="password"
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    value={supabaseKey}
                    onChange={(e) => setSupabaseKey(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-sm rounded-lg p-2.5 text-slate-300 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <button
                  onClick={handleConnectSupabase}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-lg text-sm transition"
                >
                  {isConnected ? '✓ DB 데이터 연결됨' : 'DB 연결 및 동기화'}
                </button>
              </div>

              <div className="bg-slate-950 rounded-xl p-4 border border-slate-800">
                <h3 className="font-semibold text-slate-300 mb-2 text-sm">DB 데이터 쿼리 예제 코드 (React)</h3>
                <pre className="text-xs text-indigo-300 bg-slate-900 p-3 rounded-lg overflow-x-auto font-mono leading-relaxed h-48">
{`import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  '${supabaseUrl || 'YOUR_SUPABASE_URL'}', 
  '${supabaseKey || 'YOUR_ANON_KEY'}'
)

// 운동 통계 데이터 로드 함수
async function fetchUserActivities() {
  const { data, error } = await supabase
    .from('user_activity_metrics')
    .select('*')
    .order('start_date_local', { ascending: false });
    
  if (error) console.error(error);
  return data;
}`}
                </pre>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <h3 className="font-semibold text-white mb-2 text-sm">✓ DB 테이블 권장 스키마 명세</h3>
              <p className="text-xs text-slate-400 mb-3">현재 대시보드는 아래 필드명이 DB 테이블에 존재할 때 즉시 최적화 매핑됩니다.</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-2 bg-slate-900 rounded"><span className="text-slate-500">sport_type</span> <span className="text-slate-300">Run, Ride, Swim</span></div>
                <div className="p-2 bg-slate-900 rounded"><span className="text-slate-500">distance_km</span> <span className="text-indigo-400">소수점 실수 (km)</span></div>
                <div className="p-2 bg-slate-900 rounded"><span className="text-slate-500">moving_time</span> <span className="text-indigo-400">정수 (초)</span></div>
                <div className="p-2 bg-slate-900 rounded"><span className="text-slate-500">average_heartrate</span> <span className="text-rose-400">평균심박 (bpm)</span></div>
              </div>
              <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-3">
                <p className="text-xs font-bold text-slate-300">연간 목표 저장용 테이블</p>
                <pre className="mt-2 overflow-x-auto rounded bg-slate-950 p-3 text-[11px] text-indigo-300">
{`create table if not exists dashboard_settings (
  id text primary key,
  yearly_goal numeric not null default 1000,
  monthly_goal numeric not null default 100,
  updated_at timestamptz default now()
);

alter table dashboard_settings
add column if not exists monthly_goal numeric not null default 100;`}
                </pre>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'activity_list' && (
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
            <h2 className="text-xl font-bold mb-4">전체 운동 내역 로그 ({filteredActivities.length}개)</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="text-xs text-slate-400 uppercase bg-slate-950 border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">운동명</th>
                    <th className="px-4 py-3">날짜</th>
                    <th className="px-4 py-3">종목</th>
                    <th className="px-4 py-3">거리 (km)</th>
                    <th className="px-4 py-3">시간</th>
                    <th className="px-4 py-3">페이스</th>
                    <th className="px-4 py-3">평균 심박수</th>
                    <th className="px-4 py-3">기기 정보</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredActivities.map((act) => (
                    <tr
                      key={act.id}
                      onClick={() => {
                        setRouteActivity(act);
                        setSelectedActivity(act);
                      }}
                      className="hover:bg-slate-800/50 cursor-pointer transition"
                    >
                      <td className="px-4 py-3 font-semibold text-white">{act.name}</td>
                      <td className="px-4 py-3 text-xs">{new Date(act.start_date_local).toLocaleString('ko-KR')}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          act.sport_type === 'Run' ? 'bg-orange-500/10 text-orange-400' :
                          act.sport_type === 'Ride' ? 'bg-emerald-500/10 text-emerald-400' :
                          'bg-indigo-500/10 text-indigo-400'
                        }`}>
                          {formatSportName(act.sport_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-white">{act.distance_km} km</td>
                      <td className="px-4 py-3">{formatDuration(act.moving_time)}</td>
                      <td className="px-4 py-3 font-mono">{formatPace(act.pace_min_per_km)}/km</td>
                      <td className="px-4 py-3 text-rose-400 font-semibold">{act.average_heartrate || '-'} bpm</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{act.device_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div>
            {/* Top Row: KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 relative overflow-hidden group hover:border-slate-700 transition">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">총 운동수</p>
                <p className="text-3xl font-extrabold text-white mt-1">{stats.totalCount}<span className="text-xs font-normal text-slate-400 ml-1">회</span></p>
                <div className="absolute -right-2 -bottom-2 text-slate-800 text-5xl font-black select-none opacity-30 group-hover:scale-110 transition-transform">COUNT</div>
              </div>

              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 relative overflow-hidden group hover:border-slate-700 transition">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">총 거리</p>
                <p className="text-3xl font-extrabold text-orange-500 mt-1">{stats.totalDistance}<span className="text-xs font-normal text-slate-400 ml-1">km</span></p>
                <div className="absolute -right-2 -bottom-2 text-slate-800 text-5xl font-black select-none opacity-30 group-hover:scale-110 transition-transform">DIST</div>
              </div>

              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 relative overflow-hidden group hover:border-slate-700 transition">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">총 운동시간</p>
                <p className="text-3xl font-extrabold text-white mt-1">{stats.totalTime}<span className="text-xs font-normal text-slate-400 ml-1">시간</span></p>
                <div className="absolute -right-2 -bottom-2 text-slate-800 text-5xl font-black select-none opacity-30 group-hover:scale-110 transition-transform">TIME</div>
              </div>

              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 relative overflow-hidden group hover:border-slate-700 transition">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">올해 누적거리</p>
                <p className="text-3xl font-extrabold text-cyan-400 mt-1">{stats.ytdDistance}<span className="text-xs font-normal text-slate-400 ml-1">km</span></p>
                <div className="absolute -right-2 -bottom-2 text-slate-800 text-5xl font-black select-none opacity-30 group-hover:scale-110 transition-transform">YTD</div>
              </div>

              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 relative overflow-hidden group hover:border-slate-700 transition">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">러닝 평균 페이스</p>
                <p className="text-3xl font-extrabold text-white mt-1">{stats.avgPace}<span className="text-xs font-normal text-slate-400 ml-1">/km</span></p>
                <div className="absolute -right-2 -bottom-2 text-slate-800 text-5xl font-black select-none opacity-30 group-hover:scale-110 transition-transform">PACE</div>
              </div>

              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 relative overflow-hidden group hover:border-slate-700 transition">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">평균 심박수</p>
                <p className="text-3xl font-extrabold text-rose-500 mt-1">{stats.avgHR}<span className="text-xs font-normal text-slate-400 ml-1">bpm</span></p>
                <div className="absolute -right-2 -bottom-2 text-slate-800 text-5xl font-black select-none opacity-30 group-hover:scale-110 transition-transform">HR</div>
              </div>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-2 shadow-lg shadow-black/10 md:flex md:flex-wrap">
              {[
                { id: 'overview', label: '요약', icon: '📊' },
                { id: 'analysis', label: '분석', icon: '📈' },
                { id: 'records', label: '기록', icon: '🏅' },
                { id: 'routes', label: '경로', icon: '🗺️' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setDashboardSubTab(tab.id)}
                  className={`rounded-xl px-4 py-3 text-sm font-black transition ${
                    dashboardSubTab === tab.id
                      ? 'bg-orange-500 text-white shadow shadow-orange-950/40'
                      : 'bg-slate-950 text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span className="mr-1.5">{tab.icon}</span>{tab.label}
                </button>
              ))}
            </div>

            {/* Mid Section: Charts Grid Layout */}
            {dashboardSubTab === 'overview' && (
              <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs text-slate-400 font-semibold">최근 7일 훈련량</p>
                    <p className="text-3xl font-black text-orange-400 mt-1">{subscriptionStyleInsights.currentWeekEffort}</p>
                  </div>
                  <span className={`text-xs font-bold ${subscriptionStyleInsights.effortChange >= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {subscriptionStyleInsights.effortChange >= 0 ? '+' : ''}{subscriptionStyleInsights.effortChange}%
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">이전 7일 대비 변화입니다.</p>
              </div>

              <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
                <p className="text-xs text-slate-400 font-semibold">현재 컨디션</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xl font-black text-cyan-400">{subscriptionStyleInsights.fitness}</p>
                    <p className="text-[10px] text-slate-500">체력</p>
                  </div>
                  <div>
                    <p className="text-xl font-black text-rose-400">{subscriptionStyleInsights.fatigue}</p>
                    <p className="text-[10px] text-slate-500">피로</p>
                  </div>
                  <div>
                    <p className="text-xl font-black text-emerald-400">{subscriptionStyleInsights.form}</p>
                    <p className="text-[10px] text-slate-500">상태</p>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">판정: <span className="text-slate-300 font-semibold">{subscriptionStyleInsights.formLabel}</span></p>
              </div>

              <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs text-slate-400 font-semibold">이번 달 누적</p>
                    <p className="text-3xl font-black text-white mt-1">{subscriptionStyleInsights.monthDistance}<span className="text-xs text-slate-500 ml-1">km</span></p>
                  </div>
                  <span className={`text-xs font-bold ${subscriptionStyleInsights.monthDistanceChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {subscriptionStyleInsights.monthDistanceChange >= 0 ? '+' : ''}{subscriptionStyleInsights.monthDistanceChange}%
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">{subscriptionStyleInsights.monthTime}시간 · 상승고도 {subscriptionStyleInsights.monthElevation}m</p>
              </div>

              <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs text-slate-400 font-semibold">부하 증가율</p>
                    <p className={`text-3xl font-black mt-1 ${
                      subscriptionStyleInsights.rampRate > 35 ? 'text-rose-400' :
                      subscriptionStyleInsights.rampRate > 15 ? 'text-amber-400' :
                      'text-emerald-400'
                    }`}>
                      {subscriptionStyleInsights.rampRate >= 0 ? '+' : ''}{subscriptionStyleInsights.rampRate}%
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-500 border border-slate-800 rounded px-2 py-1">7일 기준</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">판정: <span className="text-slate-300 font-semibold">{subscriptionStyleInsights.riskLabel}</span></p>
              </div>
            </div>

            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 mb-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <p className="text-xs text-slate-400 font-semibold">월간 목표</p>
                  <p className="text-2xl font-black text-white mt-1">
                    {subscriptionStyleInsights.monthDistance}
                    <span className="text-xs text-slate-500 ml-1">/ {monthlyGoal} km</span>
                  </p>
                </div>
                <div className="flex-1 min-w-[180px]">
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>이번 달 달성률</span>
                    <span>{Math.round((subscriptionStyleInsights.monthDistance / monthlyGoal) * 100)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-cyan-400"
                      style={{ width: `${Math.min((subscriptionStyleInsights.monthDistance / monthlyGoal) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    value={monthlyGoalDraft}
                    onChange={(e) => setMonthlyGoalDraft(e.target.value)}
                    className="h-9 w-24 rounded-xl border border-slate-800 bg-slate-950/80 px-3 text-center text-sm font-bold text-slate-100 outline-none shadow-inner shadow-black/20 focus:border-cyan-400"
                    title="월간 목표 km"
                  />
                  <button
                    onClick={handleSaveMonthlyGoal}
                    className="h-9 rounded-xl bg-cyan-500 px-4 text-xs font-black text-slate-950 hover:bg-cyan-400"
                  >
                    저장
                  </button>
                  <span className="text-xs text-slate-500 self-center">km</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              
              {/* 1. Monthly Distance Bar Chart (SVG-based Interactive) */}
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 lg:col-span-2">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-md font-bold text-white">월별 러닝 거리 추이 ({activeAnalysisYear})</h3>
                    <p className="text-xs text-slate-400">월별 유산소 거리 증감 및 빌드업 분석 (감지된 최신 연도 기준)</p>
                  </div>
                  <span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-300 font-mono">Run Only</span>
                </div>
                
                {/* Custom Interactive SVG Bar Chart */}
                <div className="relative h-60 w-full flex items-end justify-between px-2 pt-6">
                  {monthlyDistanceData.map((d, index) => {
                    const maxDist = Math.max(...monthlyDistanceData.map(item => item.distance), 1);
                    const barHeightPercent = (d.distance / maxDist) * 80; 
                    const validBarHeight = isNaN(barHeightPercent) ? 0 : barHeightPercent;

                    return (
                      <div key={index} className="flex-1 flex flex-col items-center group cursor-pointer h-full justify-end px-0.5">
                        {/* Tooltip value */}
                        <div className="opacity-0 group-hover:opacity-100 absolute -top-1 bg-orange-600 text-white text-[10px] font-bold py-0.5 px-1.5 rounded transition pointer-events-none transform -translate-y-2 z-10">
                          {d.distance} km
                        </div>
                        
                        {/* Bar Track & Active Bar - Added translucent background track for better visibility */}
                        <div className="w-4/5 sm:w-8 bg-slate-800/40 hover:bg-slate-800/70 rounded-t-md h-full flex flex-col justify-end overflow-hidden transition-colors border border-slate-800/50">
                          <div 
                            className="w-full bg-gradient-to-t from-orange-600 to-amber-500 rounded-t-sm group-hover:from-orange-400 group-hover:to-yellow-300 transition-all duration-500 shadow-lg shadow-orange-500/20" 
                            style={{ height: `${Math.max(validBarHeight, d.distance > 0 ? 3 : 0)}%` }}
                          ></div>
                        </div>

                        {/* Month label */}
                        <span className="text-[10px] sm:text-xs text-slate-400 mt-2 font-mono whitespace-nowrap">{d.month}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. Yearly Goal Progress Gauge */}
              <div className="grid grid-cols-1 gap-6">
                
                {/* 9. Cumulative Gauge Card */}
                <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex flex-col justify-between">
                  <div>
                    <h3 className="text-md font-bold text-white mb-1">올해 누적 목표 달성률 ({activeAnalysisYear})</h3>
                    <p className="text-xs text-slate-400">연간 목표인 1,000 km 중 누적 달성량</p>
                  </div>

                  <div className="flex items-center justify-center py-4 relative">
                    {/* SVG Radial Gauge */}
                    <svg className="w-36 h-36 transform -rotate-90">
                      <circle
                        cx="72"
                        cy="72"
                        r="60"
                        stroke="#1e293b"
                        strokeWidth="10"
                        fill="transparent"
                      />
                      <circle
                        cx="72"
                        cy="72"
                        r="60"
                        stroke="url(#orange-gradient)"
                        strokeWidth="12"
                        fill="transparent"
                        strokeDasharray={2 * Math.PI * 60}
                        strokeDashoffset={(2 * Math.PI * 60) * (1 - Math.min(stats.ytdDistance / yearlyGoal, 1))}
                        strokeLinecap="round"
                        className="transition-all duration-1000"
                      />
                      <defs>
                        <linearGradient id="orange-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#f97316" />
                          <stop offset="100%" stopColor="#e11d48" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute text-center">
                      <span className="text-3xl font-extrabold text-white block">
                        {Math.round((stats.ytdDistance / yearlyGoal) * 100)}%
                      </span>
                      <span className="text-[10px] font-semibold text-slate-400 block mt-1">
                        {stats.ytdDistance} / {yearlyGoal} km
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      value={goalDraft}
                      onChange={(e) => setGoalDraft(e.target.value)}
                      className="h-9 w-24 rounded-xl border border-slate-800 bg-slate-950/80 px-3 text-center text-sm font-bold text-slate-100 outline-none shadow-inner shadow-black/20 focus:border-orange-400"
                      title="목표 킬로미터 조정"
                    />
                    <button
                      onClick={handleSaveYearlyGoal}
                      className="h-9 rounded-xl bg-orange-500 px-4 text-xs font-black text-white hover:bg-orange-400"
                    >
                      저장
                    </button>
                    <span className="text-xs text-slate-500 self-center">km 연간 목표</span>
                  </div>
                  {goalSaveStatus && (
                    <p className="mt-2 text-[10px] text-slate-500">{goalSaveStatus}</p>
                  )}
                </div>

              </div>
            </div>
              </>
            )}

            {dashboardSubTab === 'analysis' && (
              <>
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 mb-6">
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-white">트레이닝 분석</h2>
                  <p className="text-xs text-slate-400 mt-1">페이스 구간, 반복 코스, 파워, 고도 보정 페이스를 세부적으로 봅니다.</p>
                </div>
                <span className="text-[10px] text-slate-500 border border-slate-800 rounded px-2 py-1">개인 기록 기준 요약</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="hidden">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs text-slate-400 font-semibold">Relative Effort</p>
                      <p className="text-3xl font-black text-orange-400 mt-1">{subscriptionStyleInsights.currentWeekEffort}</p>
                    </div>
                    <span className={`text-xs font-bold ${subscriptionStyleInsights.effortChange >= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {subscriptionStyleInsights.effortChange >= 0 ? '+' : ''}{subscriptionStyleInsights.effortChange}%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">최근 7일 심박/시간 기반 노력량. 이전 7일: {subscriptionStyleInsights.previousWeekEffort}</p>
                </div>

                <div className="hidden">
                  <p className="text-xs text-slate-400 font-semibold">Fitness / Fatigue / Form</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xl font-black text-cyan-400">{subscriptionStyleInsights.fitness}</p>
                      <p className="text-[10px] text-slate-500">Fitness</p>
                    </div>
                    <div>
                      <p className="text-xl font-black text-rose-400">{subscriptionStyleInsights.fatigue}</p>
                      <p className="text-[10px] text-slate-500">Fatigue</p>
                    </div>
                    <div>
                      <p className="text-xl font-black text-emerald-400">{subscriptionStyleInsights.form}</p>
                      <p className="text-[10px] text-slate-500">Form</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">현재 상태: <span className="text-slate-300 font-semibold">{subscriptionStyleInsights.formLabel}</span></p>
                </div>

                <div className="hidden">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs text-slate-400 font-semibold">월간 누적 통계</p>
                      <p className="text-3xl font-black text-white mt-1">{subscriptionStyleInsights.monthDistance}<span className="text-xs text-slate-500 ml-1">km</span></p>
                    </div>
                    <span className={`text-xs font-bold ${subscriptionStyleInsights.monthDistanceChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {subscriptionStyleInsights.monthDistanceChange >= 0 ? '+' : ''}{subscriptionStyleInsights.monthDistanceChange}%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">이번 달 {subscriptionStyleInsights.monthTime}시간 · 상승고도 {subscriptionStyleInsights.monthElevation}m</p>
                </div>

                <div className="bg-slate-950 rounded-xl border border-slate-800 p-4">
                  <p className="text-xs text-slate-400 font-semibold mb-3">러닝 페이스 존</p>
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-400"><span>Easy</span><span>{subscriptionStyleInsights.paceZoneEasy}%</span></div>
                      <div className="h-2 bg-slate-800 rounded overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${subscriptionStyleInsights.paceZoneEasy}%` }} /></div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-400"><span>Steady</span><span>{subscriptionStyleInsights.paceZoneSteady}%</span></div>
                      <div className="h-2 bg-slate-800 rounded overflow-hidden"><div className="h-full bg-orange-500" style={{ width: `${subscriptionStyleInsights.paceZoneSteady}%` }} /></div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-400"><span>Hard</span><span>{subscriptionStyleInsights.paceZoneHard}%</span></div>
                      <div className="h-2 bg-slate-800 rounded overflow-hidden"><div className="h-full bg-rose-500" style={{ width: `${subscriptionStyleInsights.paceZoneHard}%` }} /></div>
                    </div>
                  </div>
                </div>

                <div className="hidden">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs text-slate-400 font-semibold">부하 증가율</p>
                      <p className={`text-3xl font-black mt-1 ${
                        subscriptionStyleInsights.rampRate > 35 ? 'text-rose-400' :
                        subscriptionStyleInsights.rampRate > 15 ? 'text-amber-400' :
                        'text-emerald-400'
                      }`}>
                        {subscriptionStyleInsights.rampRate >= 0 ? '+' : ''}{subscriptionStyleInsights.rampRate}%
                      </p>
                    </div>
                    <span className="text-[10px] text-slate-500 border border-slate-800 rounded px-2 py-1">7일 vs 이전 3주</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">판정: <span className="text-slate-300 font-semibold">{subscriptionStyleInsights.riskLabel}</span></p>
                </div>

                <div className="bg-slate-950 rounded-xl border border-slate-800 p-4">
                  <p className="text-xs text-slate-400 font-semibold">Matched Activities</p>
                  <p className="mt-1 truncate text-sm font-bold text-white">{subscriptionStyleInsights.matchedRouteName}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div><p className="text-sm font-black text-orange-400">{subscriptionStyleInsights.matchedRouteLatest}</p><p className="text-[10px] text-slate-500">최근</p></div>
                    <div><p className="text-sm font-black text-emerald-400">{subscriptionStyleInsights.matchedRouteBest}</p><p className="text-[10px] text-slate-500">최고</p></div>
                    <div><p className="text-sm font-black text-slate-200">{subscriptionStyleInsights.matchedRouteDelta >= 0 ? '+' : ''}{subscriptionStyleInsights.matchedRouteDelta}s</p><p className="text-[10px] text-slate-500">차이/km</p></div>
                  </div>
                </div>

                <div className="bg-slate-950 rounded-xl border border-slate-800 p-4">
                  <p className="text-xs text-slate-400 font-semibold">Power Analysis</p>
                  <p className="text-3xl font-black text-violet-400 mt-1">{subscriptionStyleInsights.avgPower}<span className="text-xs text-slate-500 ml-1">W</span></p>
                  <p className="text-[11px] text-slate-500 mt-2">파워 데이터 포함률 {subscriptionStyleInsights.powerCoverage}%</p>
                  <div className="mt-2 h-2 bg-slate-800 rounded overflow-hidden">
                    <div className="h-full bg-violet-500" style={{ width: `${subscriptionStyleInsights.powerCoverage}%` }} />
                  </div>
                </div>

                <div className="bg-slate-950 rounded-xl border border-slate-800 p-4">
                  <p className="text-xs text-slate-400 font-semibold">Terrain Adjusted Pace</p>
                  <p className="text-3xl font-black text-cyan-400 mt-1">{subscriptionStyleInsights.terrainAdjustedPace}<span className="text-xs text-slate-500 ml-1">/km</span></p>
                  <p className="text-[11px] text-slate-500 mt-2">상승고도를 반영한 평지 환산 페이스 근사값입니다.</p>
                </div>
              </div>
            </div>

            {/* Bottom Grid: Analysis Details */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              
              {/* 3. Sport Type Distribution (Donut style) */}
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
                <h3 className="text-md font-bold text-white mb-1">운동 종류 비율</h3>
                <p className="text-xs text-slate-400 mb-4">멀티스포츠 훈련 편중도 점검</p>
                <div className="space-y-3">
                  {sportRatio.map((item, index) => {
                    const total = sportRatio.reduce((sum, i) => sum + i.value, 0);
                    const percentage = Math.round((item.value / total) * 100);
                    const colors = [
                      'bg-orange-500', 
                      'bg-emerald-500', 
                      'bg-cyan-500', 
                      'bg-indigo-500', 
                      'bg-amber-500'  
                    ];
                    return (
                      <div key={index} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-slate-300 flex items-center gap-1.5">
                            <span className={`w-2.5 h-2.5 rounded-full ${colors[index % colors.length]}`}></span>
                            {formatSportName(item.name)}
                          </span>
                          <span className="text-slate-400 font-mono">{item.value}회 ({percentage}%)</span>
                        </div>
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div className={`h-full ${colors[index % colors.length]}`} style={{ width: `${percentage}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 4. Pace Trend graph with dynamic slope */}
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
                <div className="flex justify-between items-center mb-1">
                  <h3 className="text-md font-bold text-white">페이스 발전 흐름 (최근 20회)</h3>
                  <span className="text-[10px] text-green-400 font-mono">낮을수록 빠름 ↘</span>
                </div>
                <p className="text-xs text-slate-400 mb-4">최근 러닝 평균 페이스 추이 관찰</p>

                <div className="relative h-36 w-full rounded-lg border border-slate-800 bg-slate-950/60 pl-10 pr-3 pt-3 pb-6">
                  <div className="absolute left-2 top-2 text-[9px] font-mono text-slate-500">{paceChartLabels.fast}</div>
                  <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-mono text-slate-600">{paceChartLabels.mid}</div>
                  <div className="absolute left-2 bottom-6 text-[9px] font-mono text-slate-500">{paceChartLabels.slow}</div>

                  <svg className="absolute left-10 right-3 top-3 bottom-6 h-[calc(100%-2.25rem)] w-[calc(100%-3.25rem)] overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
                    {[15, 50, 85].map((y) => (
                      <line
                        key={`y-${y}`}
                        x1="0"
                        y1={y}
                        x2="100"
                        y2={y}
                        stroke="#1e293b"
                        strokeWidth="0.6"
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                    {[5, 50, 95].map((x) => (
                      <line
                        key={`x-${x}`}
                        x1={x}
                        y1="0"
                        x2={x}
                        y2="100"
                        stroke="#0f172a"
                        strokeWidth="0.6"
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                    {pacePointsString && (
                      <polyline
                        fill="none"
                        stroke="#f97316"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                        points={pacePointsString}
                      />
                    )}
                    {paceChartPoints.map((h, idx) => {
                      return (
                        <g key={idx}>
                          <circle
                            cx={h.x}
                            cy={h.y}
                            r="2.1"
                            className="fill-orange-500 hover:fill-amber-300 transition cursor-pointer stroke-slate-900"
                            strokeWidth="1.2"
                            title={`Pace: ${h.paceStr}`}
                            vectorEffect="non-scaling-stroke"
                          />
                        </g>
                      );
                    })}
                  </svg>
                  <div className="absolute bottom-1 left-10 right-3 flex justify-between text-[9px] text-slate-500">
                    <span>이전</span>
                    <span>최근</span>
                  </div>
                </div>
                <div className="mt-2 text-center text-xs font-mono text-slate-300 bg-slate-950 p-2 rounded border border-slate-800">
                  최근 20회 페이스 범위: <span className="text-orange-400 font-bold">{paceChartLabels.fast} ~ {paceChartLabels.slow} /km</span>
                </div>
              </div>

              {/* 5. Heart Rate vs Pace Scatter Plot */}
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
                <div className="flex justify-between items-center mb-1">
                  <h3 className="text-md font-bold text-white">심박수 vs 페이스 분포도</h3>
                  <span className="text-[10px] text-cyan-400">최근 러닝</span>
                </div>
                <p className="text-xs text-slate-400 mb-4">최근 러닝의 평균 심박수와 평균 페이스를 비교합니다.</p>

                {/* Custom Interactive SVG Scatter Plot */}
                <div className="hidden">
                  <div className="absolute top-1 left-2 text-[9px] text-slate-500">Pace (느림 ↑)</div>
                  <div className="absolute bottom-1 right-2 text-[9px] text-slate-500">심박수 (bpm →)</div>
                  
                  {/* Scatter plot dots */}
                  {hrVsPacePoints.map((pt, idx) => {
                    const xPercent = ((pt.hr - 110) / 80) * 85 + 5;
                    const yPercent = ((pt.pace - 4.0) / 4.0) * 85 + 5;
                    return (
                      <div
                        key={idx}
                        className="absolute w-2 h-2 rounded-full bg-orange-500 hover:bg-rose-400 cursor-pointer transition"
                        style={{ left: `${xPercent}%`, top: `${yPercent}%` }}
                        title={`${pt.date} | 페이스 ${pt.paceStr} | 심박 ${pt.hr}bpm`}
                      ></div>
                    );
                  })}
                </div>
                <div className="relative h-44 w-full rounded-lg border border-slate-800 bg-slate-950/60 pl-10 pr-3 pt-3 pb-7">
                  <div className="absolute left-2 top-2 text-[9px] font-mono text-slate-500">{hrPaceLabels.fast}</div>
                  <div className="absolute left-2 bottom-7 text-[9px] font-mono text-slate-500">{hrPaceLabels.slow}</div>
                  <div className="absolute bottom-1 left-10 right-3 flex justify-between text-[9px] font-mono text-slate-500">
                    <span>{hrPaceLabels.lowHr} bpm</span>
                    <span>{hrPaceLabels.highHr} bpm</span>
                  </div>
                  <div className="absolute top-2 right-3 text-[9px] text-cyan-400">강도 증가 방향 ↗</div>
                  <svg className="absolute left-10 right-3 top-3 bottom-7 h-[calc(100%-2.5rem)] w-[calc(100%-3.25rem)] overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
                    {[15, 50, 85].map((y) => (
                      <line key={`hrp-y-${y}`} x1="0" y1={y} x2="100" y2={y} stroke="#1e293b" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
                    ))}
                    {[10, 50, 90].map((x) => (
                      <line key={`hrp-x-${x}`} x1={x} y1="0" x2={x} y2="100" stroke="#0f172a" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
                    ))}
                    <line x1="10" y1="85" x2="90" y2="15" stroke="#334155" strokeDasharray="3 3" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
                    {hrVsPacePoints.map((pt, idx) => (
                      <circle
                        key={idx}
                        cx={pt.x}
                        cy={pt.y}
                        r="2.2"
                        className={`${pt.isOutlier ? 'fill-slate-500 opacity-45' : 'fill-orange-500'} hover:fill-rose-400 transition cursor-pointer stroke-slate-900`}
                        strokeWidth="1"
                        vectorEffect="non-scaling-stroke"
                      >
                        <title>{`${pt.date} | 페이스 ${pt.paceStr}/km | 심박 ${pt.hr} bpm`}</title>
                      </circle>
                    ))}
                  </svg>
                </div>
                <div className="mt-2 text-center text-[11px] text-slate-400 leading-tight">
                  오른쪽일수록 심박이 높고, 위쪽일수록 페이스가 빠릅니다.
                </div>
                <div className="hidden">
                  점 하나는 1회의 러닝 세션입니다. 동일 심박에서 하단(빠른 페이스)으로 점이 이동할수록 유산소 능력이 발달함을 의미합니다.
                </div>
              </div>

            </div>

            {/* AI Zone Analysis & Coach row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              
              {/* 6. Running Efficiency Score Progress */}
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex flex-col justify-between">
                <div>
                  <h3 className="text-md font-bold text-white mb-1">러닝 효율성 점수 (Efficiency Score)</h3>
                  <p className="text-xs text-slate-400 mb-4">속도(m/min) / 심박수(bpm) 비율 추적</p>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center my-3">
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-850">
                    <span className="text-[10px] text-slate-500 block">최근 30일 평균</span>
                    <span className="text-lg font-black text-cyan-400">{efficiencyTrends.last30}</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-850">
                    <span className="text-[10px] text-slate-500 block">최근 90일 평균</span>
                    <span className="text-lg font-black text-indigo-400">{efficiencyTrends.last90}</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-850">
                    <span className="text-[10px] text-slate-500 block">최근 1년 평균</span>
                    <span className="text-lg font-black text-rose-400">{efficiencyTrends.lastYear}</span>
                  </div>
                </div>

                <div className="text-xs text-slate-400 p-3 bg-slate-950 rounded-lg border border-slate-850">
                  <span className="font-bold text-slate-300">💡 현재 효율: {efficiencyTrends.current}</span>
                  <p className="mt-1">수치가 높아질수록 동일 심박대비 더 적은 에너지로 빠르게 움직이고 있음을 입증합니다.</p>
                </div>
              </div>

              {/* 7. Heart Rate Zone Analysis */}
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
                <h3 className="text-md font-bold text-white mb-1">심박 구간 분석 (Zone Distribution)</h3>
                <p className="text-xs text-slate-400 mb-4">가민 포러너 수집 데이터 기반 유산소 피라미드 비율</p>
                
                <div className="space-y-2">
                  {[
                    { name: 'Zone 5 (한계 강도)', percent: zoneDistribution.z5, range: '175 bpm ~', color: 'bg-rose-600' },
                    { name: 'Zone 4 (역치 발달)', percent: zoneDistribution.z4, range: '160 - 174 bpm', color: 'bg-orange-500' },
                    { name: 'Zone 3 (템포 러닝)', percent: zoneDistribution.z3, range: '143 - 159 bpm', color: 'bg-amber-400' },
                    { name: 'Zone 2 (유산소 기초개발)', percent: zoneDistribution.z2, range: '125 - 142 bpm', color: 'bg-emerald-500' },
                    { name: 'Zone 1 (회복 러닝)', percent: zoneDistribution.z1, range: '110 - 124 bpm', color: 'bg-cyan-500' }
                  ].map((z, idx) => (
                    <div key={idx} className="text-xs">
                      <div className="flex justify-between font-medium mb-1">
                        <span className="text-slate-300">{z.name} <span className="text-[9px] text-slate-500">({z.range})</span></span>
                        <span className="font-bold text-white font-mono">{z.percent}%</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                        <div className={`h-full ${z.color}`} style={{ width: `${z.percent}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 11. AI Running Coach */}
              <div className="bg-gradient-to-br from-indigo-950/80 to-slate-900 p-5 rounded-2xl border border-indigo-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🤖</span>
                  <h3 className="text-md font-bold text-white">러닝 AI 코치 어드바이스</h3>
                </div>
                <p className="text-xs text-indigo-300 mb-4">현재 트레이닝 로드 및 몸상태를 기반으로 한 맞춤 피드백</p>
                
                <div className="space-y-3 text-xs leading-relaxed text-slate-300">
                  <div className="bg-indigo-900/40 p-3 rounded-lg border border-indigo-500/10">
                    <span className="font-bold text-white block mb-0.5">최근 4주 트레이닝 마일리지</span>
                    평균 주간 거리는 <span className="text-amber-400 font-bold">{aiCoachFeedback.recentWeeklyAvg}km</span>로, 전월 대비 {aiCoachFeedback.percentChange >= 0 ? `약 ${aiCoachFeedback.percentChange}% 증가` : `약 ${Math.abs(aiCoachFeedback.percentChange)}% 감소`}하였습니다.
                  </div>

                  <div>
                    <span className="font-bold text-indigo-400 block mb-0.5">심박 및 페이스 심화 진단</span>
                    {aiCoachFeedback.hrAnalysis}
                  </div>

                  <div className="border-t border-indigo-800/40 pt-2.5">
                    <span className="font-bold text-emerald-400 block mb-0.5">🎯 향후 4주 추천 목표 가이드</span>
                    {aiCoachFeedback.mileageRec}
                  </div>
                </div>
              </div>

            </div>

            {/* PB Board & Weekly Calendar Matrix Row */}
              </>
            )}

            {dashboardSubTab === 'records' && (
              <>
            {/* PB Board & Weekly Calendar Matrix Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              
              {/* 8. Personal Best Records (PB) with dynamic new check */}
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
                <h3 className="text-md font-bold text-white mb-1">개인 최고 기록 (Personal Best)</h3>
                <p className="text-xs text-slate-400 mb-4">거리별 최고 기록을 확인합니다.</p>
                <div className="space-y-3">
                  {pbRecords.map((pb, idx) => (
                    <button
                      key={idx}
                      disabled={!pb.raw}
                      onClick={() => {
                        if (!pb.raw) return;
                        setSelectedActivity(pb.raw);
                        if (pb.raw.raw?.map?.summary_polyline) {
                          setRouteActivity(pb.raw);
                        }
                      }}
                      className={`w-full flex justify-between items-center bg-slate-950 p-2.5 rounded-lg border border-slate-850 text-left transition ${
                        pb.raw ? 'hover:border-orange-500/70 hover:bg-slate-900 cursor-pointer' : 'cursor-default'
                      }`}
                    >
                      <div>
                        <span className="text-xs text-slate-500 font-bold block">{pb.name}</span>
                        <span className="text-sm font-black text-white">{pb.time}</span>
                        <span className="text-xs font-bold text-orange-400 ml-2">{pb.pace}</span>
                        <span className="text-[10px] text-slate-500 block mt-0.5">{pb.note}</span>
                      </div>
                      {pb.isNew ? (
                        <span className="bg-orange-500 text-slate-950 text-[10px] font-extrabold px-2 py-1 rounded animate-pulse">
                          🏆 NEW PB
                        </span>
                      ) : pb.raw ? (
                        <span className="text-[10px] text-slate-500">
                          {new Date(pb.raw.start_date_local).toLocaleDateString('ko-KR')}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-700">기록 없음</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. GitHub Style Weekly Heatmap */}
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 lg:col-span-2">
                <div className="flex justify-between items-center mb-1">
                  <h3 className="text-md font-bold text-white">주간 러닝 빈도 히트맵 (Heatmap)</h3>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <span>Less</span>
                    <span className="w-2.5 h-2.5 rounded bg-slate-800"></span>
                    <span className="w-2.5 h-2.5 rounded bg-orange-900"></span>
                    <span className="w-2.5 h-2.5 rounded bg-orange-700"></span>
                    <span className="w-2.5 h-2.5 rounded bg-orange-500"></span>
                    <span>More</span>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mb-4">최근 15주 동안의 요일별 트레이닝 밀도</p>
                
                {/* Heatmap Grid */}
                <div className="flex flex-col overflow-x-auto pb-2">
                  <div className="flex gap-1 min-w-[500px]">
                    <div className="grid grid-rows-7 gap-1 text-[10px] text-slate-500 mr-2 font-mono">
                      <span>일</span>
                      <span>월</span>
                      <span>화</span>
                      <span>수</span>
                      <span>목</span>
                      <span>금</span>
                      <span>토</span>
                    </div>
                    {heatmapData.map((week, wIdx) => (
                      <div key={wIdx} className="grid grid-rows-7 gap-1 flex-1">
                        {week.map((day, dIdx) => {
                          const dist = day?.distance || 0;
                          let bgClass = 'bg-slate-800 hover:bg-slate-700';
                          if (dist > 0 && dist < 5) bgClass = 'bg-orange-900/60 hover:bg-orange-800';
                          else if (dist >= 5 && dist < 10) bgClass = 'bg-orange-700 hover:bg-orange-600';
                          else if (dist >= 10) bgClass = 'bg-orange-500 hover:bg-orange-400';

                          return (
                            <div
                              key={dIdx}
                              className={`w-4 h-4 rounded-sm transition cursor-pointer ${bgClass}`}
                              title={`${day?.date.toLocaleDateString()}: ${dist > 0 ? `${dist} km 러닝` : '휴식 또는 타종목'}`}
                              onClick={() => {
                                if (day?.runs.length) {
                                  const firstRoute = day.runs.find(activity => activity.raw?.map?.summary_polyline);
                                  setSelectedCalendarDay({ date: day.date, activities: day.runs });
                                  setCalendarModalActivity(firstRoute || day.runs[0]);
                                }
                              }}
                            ></div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 mt-2 font-mono px-6">
                    <span>~3개월 전</span>
                    <span>현재 시점</span>
                  </div>
                </div>
                <div className="mt-6 border-t border-slate-800 pt-5">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-md font-bold text-white mb-1">월간 운동 캘린더</h3>
                      <p className="text-xs text-slate-400">{calendarMonthLabel} 운동 기록</p>
                    </div>
                    <label className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-400 shadow-inner shadow-black/20 focus-within:border-orange-500">
                      <span>월 선택</span>
                      <input
                        type="month"
                        value={calendarMonth}
                        onChange={(e) => setCalendarMonth(e.target.value)}
                        className="bg-transparent text-sm font-bold text-slate-100 outline-none [color-scheme:dark]"
                      />
                    </label>
                  </div>
                  
                  <div className="grid grid-cols-7 gap-1 text-center text-xs">
                    {['일','월','화','수','목','금','토'].map(d => (
                      <span key={d} className="text-slate-500 font-bold py-1">{d}</span>
                    ))}
                    {calendarCells.map((cell, idx) => {
                      const hasActivities = cell.activities.length > 0;
                      const totalDistance = cell.activities.reduce((sum, activity) => sum + activity.distance_km, 0);
                      const mainActivity = cell.activities[0];

                      return (
                        <button
                          key={idx}
                          type="button"
                          disabled={!cell.date}
                          onClick={() => {
                            if (hasActivities) {
                              const firstRoute = cell.activities.find(activity => activity.raw?.map?.summary_polyline);
                              setSelectedCalendarDay(cell);
                              setCalendarModalActivity(firstRoute || cell.activities[0]);
                            }
                          }}
                          className={`min-h-[70px] rounded-xl border p-2 text-left transition ${
                            cell.date ? 'bg-slate-950/50 border-slate-800' : 'border-transparent bg-transparent text-transparent'
                          } ${hasActivities ? 'border-orange-500/60 bg-orange-950/20 hover:bg-orange-950/40 cursor-pointer' : 'text-slate-600'}`}
                        >
                          {cell.date && (
                            <>
                              <span className={`block text-[11px] ${hasActivities ? 'font-black text-orange-300' : 'text-slate-500'}`}>
                                {cell.date.getDate()}
                              </span>
                              {hasActivities && (
                                <span className="mt-1 block space-y-0.5">
                                  <span className="block truncate text-[10px] font-bold text-slate-200">{formatSportName(mainActivity.sport_type)}</span>
                                  <span className="block truncate text-[10px] text-slate-400">{mainActivity.name}</span>
                                  <span className="block text-[10px] font-semibold text-cyan-300">
                                    {cell.activities.length}회 · {totalDistance.toFixed(1)}km
                                  </span>
                                </span>
                              )}
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

            </div>

              {/* Workout Calendar Widget */}
              <div className="hidden">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-md font-bold text-white mb-1">트레이닝 일정 캘린더</h3>
                    <p className="text-xs text-slate-400">{calendarMonthLabel} 운동 기록</p>
                  </div>
                  <input
                    type="month"
                    value={calendarMonth}
                    onChange={(e) => setCalendarMonth(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-orange-500 sm:w-40"
                  />
                </div>
                
                <div className="grid grid-cols-7 gap-1 text-center text-xs font-mono">
                  {['일','월','화','수','목','금','토'].map(d => (
                    <span key={d} className="text-slate-500 font-bold py-1">{d}</span>
                  ))}
                  {calendarCells.map((cell, idx) => {
                    const hasActivities = cell.activities.length > 0;
                    const totalDistance = cell.activities.reduce((sum, activity) => sum + activity.distance_km, 0);

                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={!cell.date}
                        onClick={() => {
                          if (hasActivities) {
                            const firstRoute = cell.activities.find(activity => activity.raw?.map?.summary_polyline);
                            setSelectedCalendarDay(cell);
                            setCalendarModalActivity(firstRoute || cell.activities[0]);
                          }
                        }}
                        className={`min-h-14 rounded-lg border p-1.5 text-left transition-all ${
                          cell.date ? 'bg-slate-950/40 border-slate-850' : 'border-transparent text-transparent'
                        } ${hasActivities ? 'border-orange-500 bg-orange-950/20 hover:bg-orange-950/40 cursor-pointer' : 'text-slate-600'}`}
                      >
                        {cell.date && (
                          <>
                            <span className={`block text-[11px] ${hasActivities ? 'font-bold text-orange-300' : 'text-slate-500'}`}>
                              {cell.date.getDate()}
                            </span>
                            {hasActivities && (
                              <span className="mt-1 block text-[10px] font-semibold text-slate-300">
                                {cell.activities.length}회 · {totalDistance.toFixed(1)}km
                              </span>
                            )}
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-500 text-center mt-3 leading-relaxed">
                  운동이 있는 날짜를 누르면 그날의 기록과 경로를 팝업으로 확인할 수 있습니다.
                </p>
              </div>

              </>
            )}

            {dashboardSubTab === 'routes' && (
              <>
            {/* 10. Workout Detail Modal / Route Trace Mock */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* GPS Track Map Visualizer */}
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 lg:col-span-2 relative overflow-hidden group">
                <h3 className="text-md font-bold text-white mb-1">운동 경로</h3>
                <p className="text-xs text-slate-400 mb-4">GPS 기록이 있는 활동의 이동 경로입니다.</p>
                {routeActivity && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="rounded bg-slate-950 px-2 py-1 text-orange-300">{formatSportName(routeActivity.sport_type)}</span>
                    <span className="font-semibold text-slate-200">{routeActivity.name}</span>
                    <span>{new Date(routeActivity.start_date_local).toLocaleString('ko-KR')}</span>
                  </div>
                )}
                
                <div className="h-[420px] bg-slate-950 rounded-xl relative flex items-center justify-center overflow-hidden border border-slate-800">
                  <RouteMap activity={routeActivity} />

                  <div className="absolute bottom-3 left-3 z-10 bg-slate-900/90 backdrop-blur text-[11px] p-3 rounded-lg border border-slate-800 text-slate-300">
                    <span className="font-bold text-white block">📍 주요 코스 정보</span>
                    <span>상세 경로가 포함된 가민 FIT 수신 완료</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
                <h3 className="text-md font-bold text-white mb-1">경로 활동 목록</h3>
                <p className="text-xs text-slate-400 mb-4">활동을 누르면 왼쪽 지도 경로가 바뀝니다.</p>
                <div className="relative mb-3">
                  <input
                    type="text"
                    placeholder="경로 활동 검색..."
                    value={routeSearchTerm}
                    onChange={(e) => setRouteSearchTerm(e.target.value)}
                    className="w-full bg-slate-950 text-sm text-slate-200 pl-9 pr-3 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-orange-500 transition"
                  />
                  <span className="absolute left-3 top-2.5 text-slate-500">🔍</span>
                </div>
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {filteredRouteActivities.length > 0 ? filteredRouteActivities.map((activity) => (
                    <button
                      key={activity.id}
                      onClick={() => setRouteActivity(activity)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        routeActivity?.id === activity.id
                          ? 'border-orange-500 bg-orange-500/10 text-white'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                      title={`${activity.name} | ${new Date(activity.start_date_local).toLocaleString('ko-KR')}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-orange-300">{formatSportName(activity.sport_type)}</span>
                        <span className="font-mono text-[10px] text-slate-500">{activity.distance_km.toFixed(1)} km</span>
                      </div>
                      <span className="mt-1 block truncate text-sm font-semibold">{activity.name}</span>
                      <span className="mt-1 block text-[10px] text-slate-500">{new Date(activity.start_date_local).toLocaleString('ko-KR')}</span>
                    </button>
                  )) : (
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-500">
                      {routeActivities.length > 0 ? '검색 결과가 없습니다.' : '표시할 GPS 경로가 있는 활동이 없습니다.'}
                    </div>
                  )}
                </div>
              </div>
            </div>
              </>
            )}
          </div>
        )}

      </main>

      {/* Calendar Day Detail Popup */}
      {selectedCalendarDay && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl max-w-2xl w-full border border-slate-800 overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-850 flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-white">
                  {selectedCalendarDay.date?.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  총 {selectedCalendarDay.activities.length}개 활동 · {selectedCalendarDay.activities.reduce((sum, activity) => sum + activity.distance_km, 0).toFixed(1)}km
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedCalendarDay(null);
                  setCalendarModalActivity(null);
                }}
                className="text-slate-400 hover:text-white bg-slate-950 p-1.5 rounded-lg border border-slate-800 transition"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 p-5">
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {selectedCalendarDay.activities.map((activity) => (
                  <button
                    key={activity.id}
                    onClick={() => setCalendarModalActivity(activity)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      calendarModalActivity?.id === activity.id
                        ? 'border-orange-500 bg-orange-500/10 text-white'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-orange-300">{formatSportName(activity.sport_type)}</span>
                      <span className="font-mono text-[10px] text-slate-500">{activity.distance_km.toFixed(1)} km</span>
                    </div>
                    <span className="mt-1 block truncate text-sm font-semibold">{activity.name}</span>
                    <span className="mt-1 block text-[10px] text-slate-500">{new Date(activity.start_date_local).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                {calendarModalActivity && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                      <span className="text-[10px] text-slate-500">거리</span>
                      <p className="text-lg font-black text-white">{calendarModalActivity.distance_km.toFixed(1)}km</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                      <span className="text-[10px] text-slate-500">시간</span>
                      <p className="text-lg font-black text-white">{formatDuration(calendarModalActivity.moving_time)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                      <span className="text-[10px] text-slate-500">페이스</span>
                      <p className="text-lg font-black text-orange-400">{formatPace(calendarModalActivity.pace_min_per_km)}/km</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                      <span className="text-[10px] text-slate-500">심박</span>
                      <p className="text-lg font-black text-rose-400">{calendarModalActivity.average_heartrate ? Math.round(calendarModalActivity.average_heartrate) : '-'} bpm</p>
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-400">
                  {calendarModalActivity?.raw?.map?.summary_polyline
                    ? 'GPS 경로가 있는 활동입니다. 경로는 아래 버튼으로 경로 탭에서 확인할 수 있습니다.'
                    : '이 활동은 저장된 GPS 경로가 없습니다.'}
                </div>

                {calendarModalActivity && (
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setSelectedActivity(calendarModalActivity);
                        setSelectedCalendarDay(null);
                        setCalendarModalActivity(null);
                      }}
                      className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-300 hover:text-white"
                    >
                      상세 기록 보기
                    </button>
                    {calendarModalActivity.raw?.map?.summary_polyline && (
                      <button
                        onClick={() => {
                          setRouteActivity(calendarModalActivity);
                          setDashboardSubTab('routes');
                          setSelectedCalendarDay(null);
                          setCalendarModalActivity(null);
                        }}
                        className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-bold text-white hover:bg-orange-400"
                      >
                        경로 탭에서 보기
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Selected Workout Detail Panel Popups */}
      {selectedActivity && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-800 overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-850 flex justify-between items-start">
              <div>
                <span className="text-xs bg-orange-500/10 text-orange-400 font-bold px-2 py-0.5 rounded uppercase">
                  {formatSportName(selectedActivity.sport_type)}
                </span>
                <h3 className="text-lg font-bold text-white mt-1">{selectedActivity.name}</h3>
                <p className="text-xs text-slate-400">{new Date(selectedActivity.start_date_local).toLocaleString('ko-KR')}</p>
              </div>
              <button
                onClick={() => setSelectedActivity(null)}
                className="text-slate-400 hover:text-white bg-slate-950 p-1.5 rounded-lg border border-slate-800 transition"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-sm text-slate-300">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-850">
                  <span className="text-xs text-slate-500 font-medium">훈련 거리</span>
                  <p className="text-xl font-extrabold text-white mt-0.5">{selectedActivity.distance_km} km</p>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-850">
                  <span className="text-xs text-slate-500 font-medium">페이스 / 속도</span>
                  <p className="text-xl font-extrabold text-orange-400 mt-0.5 font-mono">
                    {formatPace(selectedActivity.pace_min_per_km)}/km
                  </p>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-850">
                  <span className="text-xs text-slate-500 font-medium">평균 심박수 / 최대심박</span>
                  <p className="text-xl font-extrabold text-rose-500 mt-0.5">
                    {selectedActivity.average_heartrate || '-'} / {selectedActivity.max_heartrate || '-'} bpm
                  </p>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-850">
                  <span className="text-xs text-slate-500 font-medium">이동 시간 / 경과 시간</span>
                  <p className="text-xl font-extrabold text-white mt-0.5">
                    {formatDuration(selectedActivity.moving_time)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center text-xs">
                <div className="bg-slate-950 p-2 rounded">
                  <span className="text-slate-500 block">평균 케이던스</span>
                  <span className="font-bold text-white text-sm">{selectedActivity.average_cadence || '-'} spm</span>
                </div>
                <div className="bg-slate-950 p-2 rounded">
                  <span className="text-slate-500 block">고도 상승량</span>
                  <span className="font-bold text-white text-sm">+{selectedActivity.total_elevation_gain || 0} m</span>
                </div>
                <div className="bg-slate-950 p-2 rounded">
                  <span className="text-slate-500 block">평균 파워</span>
                  <span className="font-bold text-white text-sm">{selectedActivity.average_watts || '-'} W</span>
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 text-xs flex justify-between items-center text-slate-400">
                <div className="flex items-center gap-2">
                  <span>⏱</span>
                  <span>동기화 기기: <strong className="text-white">{selectedActivity.device_name}</strong></span>
                </div>
                <span className="text-emerald-400 font-mono">Garmin Connect Sync OK</span>
              </div>

              {selectedActivity.raw?.map?.summary_polyline && (
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-850">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400">GPS 경로</span>
                    <button
                      onClick={() => {
                        setRouteActivity(selectedActivity);
                        setDashboardSubTab('routes');
                        setSelectedActivity(null);
                      }}
                      className="rounded bg-orange-500/10 px-2 py-1 text-[10px] font-bold text-orange-300 hover:bg-orange-500/20"
                    >
                      경로 탭에서 보기
                    </button>
                  </div>
                  <div className="h-48 overflow-hidden rounded-lg border border-slate-800">
                    <RouteMap activity={selectedActivity} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manual Insert Mockup Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleAddRun} className="bg-slate-900 rounded-2xl max-w-md w-full border border-slate-800 overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-850 flex justify-between items-center">
              <h3 className="text-md font-bold text-white">동기화 테스트용 러닝 추가</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">러닝 거리 (km)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newRunDistance}
                  onChange={(e) => setNewRunDistance(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-sm rounded-lg p-2 text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">페이스 (분:초)</label>
                  <input
                    type="text"
                    required
                    placeholder="5:30"
                    value={newRunPace}
                    onChange={(e) => setNewRunPace(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-sm rounded-lg p-2 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">평균 심박수 (bpm)</label>
                  <input
                    type="number"
                    required
                    value={newRunHR}
                    onChange={(e) => setNewRunHR(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-sm rounded-lg p-2 text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">케이던스 (spm)</label>
                  <input
                    type="number"
                    value={newRunCadence}
                    onChange={(e) => setNewRunCadence(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-sm rounded-lg p-2 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">운동 일자</label>
                  <input
                    type="date"
                    required
                    value={newRunDate}
                    onChange={(e) => setNewRunDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-sm rounded-lg p-2 text-slate-100"
                  />
                </div>
              </div>
            </div>

            <div className="p-5 bg-slate-950 border-t border-slate-850 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg text-xs font-bold transition"
              >
                취소
              </button>
              <button
                type="submit"
                className="bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-lg text-xs font-bold transition"
              >
                훈련 기록 추가
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-8 mt-12 text-center text-xs text-slate-600">
        <p>© 2026 운동 대시보드. Garmin 연동 데이터와 개인 DB 기반 분석.</p>
        <p className="mt-1">개인 운동 기록을 깔끔하게 확인하기 위한 대시보드입니다.</p>
      </footer>
    </div>
  );
}
