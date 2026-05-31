import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_TABLE = import.meta.env.VITE_SUPABASE_TABLE || 'activities';

const toNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeDateTime = (value) => {
  if (!value) return new Date().toISOString();
  return String(value).replace(' ', 'T');
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
    start_date_local: normalizeDateTime(row.start_date_local || row.start_date),
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
  const [yearlyGoal, setYearlyGoal] = useState(1000);
  const [supabaseUrl, setSupabaseUrl] = useState(SUPABASE_URL);
  const [supabaseKey, setSupabaseKey] = useState(SUPABASE_ANON_KEY);
  const [isConnected, setIsConnected] = useState(false);
  const [dataSource, setDataSource] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard'); 
  const [searchTerm, setSearchTerm] = useState('');

  // Form states for manually adding test runs
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRunDistance, setNewRunDistance] = useState('5.0');
  const [newRunPace, setNewRunPace] = useState('5:30');
  const [newRunHR, setNewRunHR] = useState('145');
  const [newRunCadence, setNewRunCadence] = useState('172');
  const [newRunDate, setNewRunDate] = useState(new Date().toISOString().substring(0, 10));

  const loadSupabaseActivities = async (url = SUPABASE_URL, key = SUPABASE_ANON_KEY, showAlert = false) => {
    if (!url || !key) {
      setActivities([]);
      setIsConnected(false);
      setDataSource('error');
      setLoadError('Vercel 환경변수 VITE_SUPABASE_URL 또는 VITE_SUPABASE_ANON_KEY가 없어 Supabase 데이터를 불러올 수 없습니다.');
      return;
    }

    try {
      setDataSource('loading');
      setLoadError('');
      const supabase = createClient(url, key);
      const data = await fetchAllSupabaseActivities(supabase);

      setActivities((data || []).map(normalizeSupabaseActivity));
      setIsConnected(true);
      setDataSource('supabase');
    } catch (error) {
      console.error('Failed to load Supabase activities:', error);
      setActivities([]);
      setIsConnected(false);
      setDataSource('error');
      setLoadError(error?.message || 'Supabase 데이터를 불러오지 못했습니다.');
      if (showAlert) {
        alert('Supabase 데이터를 불러오지 못했습니다. URL, anon key, 테이블 이름, RLS 정책을 확인해주세요.');
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
      const matchSearch = act.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          act.device_name.toLowerCase().includes(searchTerm.toLowerCase());
      return matchSport && matchSearch;
    });
  }, [activities, selectedSport, searchTerm]);

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
    const runsOnly = activities.filter(a => a.sport_type === 'Run');
    const totalCount = filteredActivities.length;
    const totalDistance = filteredActivities.reduce((sum, a) => sum + a.distance_km, 0);
    const totalTime = filteredActivities.reduce((sum, a) => sum + a.moving_time, 0);
    
    // YTD calculation dynamically based on the latest available year in data
    const ytdDistance = filteredActivities
      .filter(a => new Date(a.start_date_local).getFullYear() === activeAnalysisYear)
      .reduce((sum, a) => sum + a.distance_km, 0);

    // Running Pace & HR calculation
    const runningPaceSum = runsOnly.reduce((sum, a) => sum + a.pace_min_per_km, 0);
    const avgRunningPaceDecimal = runsOnly.length > 0 ? runningPaceSum / runsOnly.length : 0;
    
    const runningHRSum = runsOnly.reduce((sum, a) => sum + (a.average_heartrate || 0), 0);
    const avgRunningHR = runsOnly.length > 0 ? Math.round(runningHRSum / runsOnly.length) : 0;

    return {
      totalCount,
      totalDistance: parseFloat(totalDistance.toFixed(1)),
      totalTime: Math.round(totalTime / 3600), 
      ytdDistance: parseFloat(ytdDistance.toFixed(1)),
      avgPace: formatPace(avgRunningPaceDecimal),
      avgHR: avgRunningHR
    };
  }, [filteredActivities, activities, activeAnalysisYear]);

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

  // 3. Sport Type ratio calculation
  const sportRatio = useMemo(() => {
    const counts = {};
    activities.forEach(a => {
      counts[a.sport_type] = (counts[a.sport_type] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [activities]);

  // 4. Pace Progression over time (Running Only)
  const paceHistory = useMemo(() => {
    return activities
      .filter(a => a.sport_type === 'Run')
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

  // 5. Heart Rate vs Pace Scatter Plot points
  const hrVsPacePoints = useMemo(() => {
    return activities
      .filter(a => a.sport_type === 'Run' && a.average_heartrate && a.pace_min_per_km)
      .slice(0, 40)
      .map(a => {
        const speedKmh = 60 / a.pace_min_per_km;
        return {
          id: a.id,
          name: a.name,
          date: new Date(a.start_date_local).toLocaleDateString(),
          hr: a.average_heartrate,
          pace: a.pace_min_per_km,
          paceStr: formatPace(a.pace_min_per_km),
          distance: a.distance_km,
          speedKmh
        };
      });
  }, [activities]);

  // 6. Running Efficiency Score Calculation
  const efficiencyTrends = useMemo(() => {
    const runs = activities.filter(a => a.sport_type === 'Run' && a.average_heartrate).slice(0, 30);
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
    const runs = activities.filter(a => a.sport_type === 'Run' && a.average_heartrate);
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
    const runs = activities.filter(a => a.sport_type === 'Run');
    
    const getBest = (targetDist, tolerance = 0.5) => {
      const candidates = runs.filter(r => Math.abs(r.distance_km - targetDist) <= tolerance);
      if (!candidates.length) return null;
      return candidates.sort((a, b) => a.pace_min_per_km - b.pace_min_per_km)[0];
    };

    const pb1k = getBest(1.0, 0.2);
    const pb3k = getBest(3.0, 0.4);
    const pb5k = getBest(5.0, 0.5);
    const pb10k = getBest(10.0, 0.8);
    const pbHalf = getBest(21.1, 1.5);

    const absoluteNewestRunId = runs[0]?.id;

    return [
      { name: '1 km', time: pb1k ? formatPace(pb1k.pace_min_per_km) : 'N/A', isNew: pb1k?.id === absoluteNewestRunId, raw: pb1k },
      { name: '3 km', time: pb3k ? formatDuration(pb3k.moving_time * (3 / pb3k.distance_km)) : 'N/A', isNew: pb3k?.id === absoluteNewestRunId, raw: pb3k },
      { name: '5 km', time: pb5k ? formatDuration(pb5k.moving_time * (5 / pb5k.distance_km)) : 'N/A', isNew: pb5k?.id === absoluteNewestRunId, raw: pb5k },
      { name: '10 km', time: pb10k ? formatDuration(pb10k.moving_time * (10 / pb10k.distance_km)) : 'N/A', isNew: pb10k?.id === absoluteNewestRunId, raw: pb10k },
      { name: '하프 마라톤', time: pbHalf ? formatDuration(pbHalf.moving_time * (21.1 / pbHalf.distance_km)) : 'N/A', isNew: pbHalf?.id === absoluteNewestRunId, raw: pbHalf },
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
      alert("Supabase URL과 API Key를 입력해주십시오.");
      return;
    }
    loadSupabaseActivities(supabaseUrl, supabaseKey, true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      
      {/* Top Banner & Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-orange-500 text-white p-2 rounded-lg font-black tracking-wider flex items-center justify-center">
              STRAVA+
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                PULSE RUN <span className="text-xs px-2 py-0.5 bg-orange-500/20 text-orange-400 font-mono rounded">Pro</span>
              </h1>
              <p className="text-xs text-slate-400">Garmin & Supabase 연동 개인화 러닝 분석 대시보드</p>
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
              Supabase 연동설정
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
              {dataSource === 'loading' && 'Supabase 데이터를 불러오는 중입니다.'}
              {dataSource === 'error' && 'Supabase 연결에 실패했습니다.'}
            </div>
            {loadError && <div className="mt-1 text-xs opacity-90">{loadError}</div>}
          </div>
        )}

        {/* Global Filter Bar */}
        <div className="mb-6 p-4 bg-slate-900 rounded-xl border border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">운동 종목 필터</span>
            {['All', 'Run', 'Ride', 'Swim', 'Hike', 'AlpineSki'].map((sport) => (
              <button
                key={sport}
                onClick={() => setSelectedSport(sport)}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                  selectedSport === sport
                    ? 'bg-slate-100 text-slate-900'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {sport === 'All' ? '전체 보기' : 
                 sport === 'Run' ? '🏃 러닝' : 
                 sport === 'Ride' ? '🚴 사이클' : 
                 sport === 'Swim' ? '🏊 수영' : 
                 sport === 'Hike' ? '🥾 하이킹' : '🎿 스키'}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-64">
            <input
              type="text"
              placeholder="제목, 기기명 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 text-sm text-slate-200 pl-9 pr-4 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-orange-500 transition"
            />
            <span className="absolute left-3 top-2.5 text-slate-500">🔍</span>
          </div>
        </div>

        {activeTab === 'supabase_guide' && (
          <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-emerald-500 text-slate-950 p-2 rounded-lg font-bold">Supabase</div>
              <h2 className="text-xl font-bold">내 Supabase 데이터베이스와 연결하기</h2>
            </div>
            <p className="text-slate-300 text-sm mb-6 leading-relaxed">
              사용 중이신 Supabase 프로젝트의 고유 API 자격 증명을 사용하여 실시간으로 데이터를 로드할 수 있습니다. 
              수파베이스 내의 테이블 이름이 아래 스키마 구조와 대응하는지 확인해 보십시오.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="space-y-4">
                <h3 className="font-semibold text-orange-400 border-b border-slate-800 pb-2">연동 자격 증명 설정</h3>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">SUPABASE URL</label>
                  <input
                    type="text"
                    placeholder="https://your-project.supabase.co"
                    value={supabaseUrl}
                    onChange={(e) => setSupabaseUrl(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-sm rounded-lg p-2.5 text-slate-300 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">SUPABASE ANON KEY</label>
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
                  {isConnected ? '✓ Supabase 데이터 연결됨' : 'Supabase 연결 및 동기화'}
                </button>
              </div>

              <div className="bg-slate-950 rounded-xl p-4 border border-slate-800">
                <h3 className="font-semibold text-slate-300 mb-2 text-sm">Supabase 데이터 쿼리 예제 코드 (React)</h3>
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
              <h3 className="font-semibold text-white mb-2 text-sm">✓ Supabase 테이블 권장 스키마 명세</h3>
              <p className="text-xs text-slate-400 mb-3">현재 대시보드는 아래 필드명이 Supabase DB 테이블에 존재할 때 즉시 최적화 매핑됩니다.</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-2 bg-slate-900 rounded"><span className="text-slate-500">sport_type</span> <span className="text-slate-300">Run, Ride, Swim</span></div>
                <div className="p-2 bg-slate-900 rounded"><span className="text-slate-500">distance_km</span> <span className="text-indigo-400">소수점 실수 (km)</span></div>
                <div className="p-2 bg-slate-900 rounded"><span className="text-slate-500">moving_time</span> <span className="text-indigo-400">정수 (초)</span></div>
                <div className="p-2 bg-slate-900 rounded"><span className="text-slate-500">average_heartrate</span> <span className="text-rose-400">평균심박 (bpm)</span></div>
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
                      onClick={() => setSelectedActivity(act)}
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
                          {act.sport_type}
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

            {/* Mid Section: Charts Grid Layout */}
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

                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={yearlyGoal}
                      onChange={(e) => setYearlyGoal(Math.max(1, parseInt(e.target.value) || 1000))}
                      className="w-24 text-center bg-slate-950 border border-slate-800 text-xs rounded p-1 text-slate-300"
                      title="목표 킬로미터 조정"
                    />
                    <span className="text-xs text-slate-500 self-center">km 연간 목표 수동 수정</span>
                  </div>
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
                            {item.name === 'Run' ? '🏃 Running' : 
                             item.name === 'Ride' ? '🚴 Riding' : 
                             item.name === 'Swim' ? '🏊 Swimming' : 
                             item.name === 'Hike' ? '🥾 Hiking' : '🎿 AlpineSki'}
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

                {/* Simulated Custom Line chart */}
                <div className="relative h-44 w-full flex items-end justify-between px-2 pt-6">
                  <svg className="absolute inset-0 w-full h-full p-2" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {pacePointsString && (
                      <polyline
                        fill="none"
                        stroke="#f97316"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={pacePointsString}
                      />
                    )}
                    {/* SVG Interactive coordinates */}
                    {paceChartPoints.map((h, idx) => {
                      return (
                        <g key={idx}>
                          <circle
                            cx={h.x}
                            cy={h.y}
                            r="4.5"
                            className="fill-orange-500 hover:fill-amber-300 transition cursor-pointer stroke-slate-900 stroke-2"
                            title={`Pace: ${h.paceStr}`}
                          />
                        </g>
                      );
                    })}
                  </svg>
                  <div className="absolute bottom-1 w-full flex justify-between text-[9px] text-slate-500 px-1">
                    <span>이전</span>
                    <span>최근</span>
                  </div>
                </div>
                <div className="mt-2 text-center text-xs font-mono text-slate-300 bg-slate-950 p-2 rounded border border-slate-800">
                  선형 평균 페이스 범위: <span className="text-orange-400 font-bold">4:30 ~ 7:30 /km</span>
                </div>
              </div>

              {/* 5. Heart Rate vs Pace Scatter Plot */}
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
                <div className="flex justify-between items-center mb-1">
                  <h3 className="text-md font-bold text-white">심박수 vs 페이스 분포도</h3>
                  <span className="text-[10px] text-cyan-400">우하향 = 고효율</span>
                </div>
                <p className="text-xs text-slate-400 mb-4">유산소 러닝 코치용 연관 산점도</p>

                {/* Custom Interactive SVG Scatter Plot */}
                <div className="relative h-44 w-full bg-slate-950 rounded-lg p-2 border border-slate-800 overflow-hidden">
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
                <div className="mt-2 text-center text-[11px] text-slate-400 leading-tight">
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              
              {/* 8. Personal Best Records (PB) with dynamic new check */}
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
                <h3 className="text-md font-bold text-white mb-1">개인 최고 기록 (Personal Best)</h3>
                <p className="text-xs text-slate-400 mb-4">수파베이스 DB에 저장된 기록 중 부문별 자동 감지</p>
                <div className="space-y-3">
                  {pbRecords.map((pb, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-slate-950 p-2.5 rounded-lg border border-slate-850">
                      <div>
                        <span className="text-xs text-slate-500 font-bold block">{pb.name}</span>
                        <span className="text-sm font-black text-white">{pb.time}</span>
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
                    </div>
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
                                  setSelectedActivity(day.runs[0]);
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
              </div>

            </div>

            {/* 10. Workout Detail Modal / Route Trace Mock */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* GPS Track Map Visualizer */}
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 lg:col-span-2 relative overflow-hidden group">
                <h3 className="text-md font-bold text-white mb-1">GPS 러닝 트랙 시각화 (Strava Map Mock)</h3>
                <p className="text-xs text-slate-400 mb-4">Garmin 기기로부터 복원된 최근 GPS 액티비티 경로</p>
                
                <div className="h-64 bg-slate-950 rounded-xl relative flex items-center justify-center overflow-hidden border border-slate-800">
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:2rem_2rem] opacity-30"></div>
                  
                  <svg className="w-full h-full max-h-56 max-w-lg stroke-orange-500 stroke-[4] fill-none stroke-linecap-round">
                    <path d={generateMapPath(selectedActivity?.id || 101)} className="animate-pulse" />
                  </svg>

                  <div className="absolute bottom-3 left-3 bg-slate-900/90 backdrop-blur text-[11px] p-3 rounded-lg border border-slate-800 text-slate-300">
                    <span className="font-bold text-white block">📍 주요 코스 정보</span>
                    <span>상세 경로가 포함된 가민 FIT 수신 완료</span>
                  </div>
                </div>
              </div>

              {/* Workout Calendar Widget */}
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
                <h3 className="text-md font-bold text-white mb-1">트레이닝 일정 캘린더</h3>
                <p className="text-xs text-slate-400 mb-3">훈련일수 기반 클릭 시 상세 운동 데이터 팝업</p>
                
                {/* Mini Workout Calendar */}
                <div className="grid grid-cols-7 gap-1 text-center text-xs font-mono">
                  {['일','월','화','수','목','금','토'].map(d => (
                    <span key={d} className="text-slate-500 font-bold py-1">{d}</span>
                  ))}
                  {Array(35).fill(null).map((_, idx) => {
                    const dayNum = idx - 3; 
                    const isDay = dayNum > 0 && dayNum <= 31;
                    
                    const dayAct = isDay && activities.find(a => {
                      const d = new Date(a.start_date_local);
                      return d.getMonth() === 4 && d.getDate() === dayNum && d.getFullYear() === activeAnalysisYear;
                    });

                    return (
                      <div
                        key={idx}
                        onClick={() => dayAct && setSelectedActivity(dayAct)}
                        className={`h-9 flex flex-col items-center justify-center rounded-lg transition-all ${
                          isDay ? 'bg-slate-950/40 border border-slate-850 cursor-pointer' : 'text-transparent'
                        } ${dayAct ? 'border-orange-500 bg-orange-950/20 hover:bg-orange-950/40' : ''}`}
                      >
                        {isDay && (
                          <>
                            <span className={`text-[10px] ${dayAct ? 'font-bold text-orange-400' : 'text-slate-400'}`}>{dayNum}</span>
                            {dayAct && <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-500 text-center mt-3 leading-relaxed">
                  주황색 포인트가 있는 날짜를 클릭하면 해당 운동 정보가 아래 상세 팝업창에 활성화됩니다.
                </p>
              </div>

            </div>
          </div>
        )}

      </main>

      {/* Selected Workout Detail Panel Popups */}
      {selectedActivity && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-800 overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-850 flex justify-between items-start">
              <div>
                <span className="text-xs bg-orange-500/10 text-orange-400 font-bold px-2 py-0.5 rounded uppercase">
                  {selectedActivity.sport_type}
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
        <p>© 2026 PULSE RUN. All Rights Reserved. Powered by Garmin integration, Strava schemas & Supabase database.</p>
        <p className="mt-1">Designed for elite athletes who inspect every metric in high-fidelity.</p>
      </footer>
    </div>
  );
}
