import React, { useState, useEffect } from 'react';
import { saveAs } from 'file-saver';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import './App.css';
import { icon } from 'leaflet';
import { useMap } from 'react-leaflet';
import { CommentModal } from './components/CommentModal';

import { TrackPoint, generateGPX, generateKML } from "./utils/exportFormats";

import { parseCSV, parseGPX, parseKML } from "./utils/importFormats";
import { ExportModal } from './components/ExportModal';

import { signIn, signOut, authSubscribe, User, uploadFile, setDoc } from "@junobuild/core";
import { Navbar } from './components/Navbar';

import { TrackPointsModal } from './components/TrackPointsModal';
import { FeedbackModal } from './components/FeedbackModal';
import { getDoc } from "@junobuild/core";
import { useNotification } from './context/NotificationContext';
import { UserStats } from "./types/UserStats";
import { StartTrackModal } from './components/StartTrackModal';

import { saveTrackPointsToIndexDB, getTrackPointsFromIndexDB } from './utils/IndexDBHandler';
import Cookies from 'js-cookie';


interface ProfileSettings {
  storageId: string;
  trackPointCollection: string;
  trackFileCollection: string;
}

// Fix for default marker icon
const defaultIcon = icon({
  iconUrl: '/marker-icon.png',
  shadowUrl: '/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

const currentLocationIcon = icon({
  iconUrl: '/marker-icon.png',
  shadowUrl: '/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});


function MainApp() {
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const [showNotice, setShowNotice] = useState(true);

  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const [importPoints, setImportPoints] = useState<TrackPoint[]>([]);
  const [userLocation, setUserLocation] = useState<[number, number]>([49.2827, -123.1207]);
  const [recordingMode, setRecordingMode] = useState<'manual' | 'auto'>('manual');
  const [recordingInterval, setRecordingInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  const [isTracking, setIsTracking] = useState(false);
  const [trackingStatus, setTrackingStatus] = useState<'idle' | 'tracking' | 'paused'>('idle');
  const [autoRecordingSettings, setAutoRecordingSettings] = useState({
    minDistance: 10, // meters
    minTime: 10, // seconds
    lastRecordedPosition: null as TrackPoint | null
  });
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [pendingPosition, setPendingPosition] = useState<GeolocationPosition | null>(null);
  const [locationError, setLocationError] = useState<string>('');
  const [autoCenter, setAutoCenter] = useState(false);
  const [showPoints, setShowPoints] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [showPointsModal, setShowPointsModal] = useState(false);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [userSettings, setUserSettings] = useState<ProfileSettings | null>(null);
  const [initialCenterAfterImportDone, setInitialCenterAfterImportDone] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showStartModal, setShowStartModal] = useState(false);
  const [hasCloudPoints, setHasCloudPoints] = useState(false);

  const { showNotification } = useNotification();

  useEffect(() => {
    const savedTrackId = Cookies.get('lastTrackId');
    if (savedTrackId) {
      setTrackId(savedTrackId);
    }
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleShowNotification = (message: string, type: 'success' | 'error' | 'info') => {
    setNotification({ message, type });
  };

  useEffect(() => {
    const loadPoints = async () => {
      const savedPoints = await getTrackPointsFromIndexDB(trackId);
      if (savedPoints.length > 0) {
        setTrackPoints(savedPoints);
      }
    };
    loadPoints();
  }, [trackId]);

  useEffect(() => {
    const loadUserSettings = async () => {
      if (user?.key) {
        const doc = await getDoc<ProfileSettings>({
          collection: "profiles",
          key: user.key
        });

        if (doc?.data) {
          setUserSettings(doc.data);
        }
      }
    };

    loadUserSettings();
  }, [user]);

  useEffect(() => {
    const unsubscribe = authSubscribe((user: User | null) => {
      setUser(user);
    });
    return () => unsubscribe();
  }, []);

  const handleAuth = async (): Promise<void> => {
    console.log("signing in ", user)
    if (user) {
      await signOut();
    } else {

      await signIn({
        maxTimeToLive: BigInt(24 * 60 * 60 * 1000 * 1000 * 1000) //24 hours       
      });
    }
  };
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude]);
          setLocationError(''); // Clear any previous errors
        },
        (error) => {
          let errorMessage = 'Unable to get your location. ';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage += 'Please enable location permissions.';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage += 'Location information unavailable.';
              break;
            case error.TIMEOUT:
              errorMessage += 'Location request timed out.';
              break;
          }
          setLocationError(errorMessage);
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        }
      );
    }
  }, []);


  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const getTotalDistance = (): number => {
    if (trackPoints.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < trackPoints.length; i++) {
      total += calculateDistance(
        trackPoints[i - 1].latitude,
        trackPoints[i - 1].longitude,
        trackPoints[i].latitude,
        trackPoints[i].longitude
      );
    }
    return total;
  };
  const getElevationGain = (): number => {
    let elevationGain = 0;
    for (let i = 1; i < trackPoints.length; i++) {
      const elevationDiff = (trackPoints?.[i].elevation ?? 0) - (trackPoints?.[i - 1].elevation ?? 0);
      if (elevationDiff > 0) {
        elevationGain += elevationDiff;
      }
    }
    return elevationGain;
  };

  const getDuration = (): number => {
    if (trackPoints.length < 2) return 0;
    const startTime = trackPoints[0].timestamp;
    const endTime = trackPoints[trackPoints.length - 1].timestamp;
    const durationMs = endTime - startTime;
    return durationMs / (1000 * 60 * 60); // Convert milliseconds to hours
  };

  function RecenterMap({ position }: { position: [number, number] }) {
    const map = useMap();
    map.setView(position);
    return null;
  }

  const getMapCenter = () => {
    if (isTracking) {
      return userLocation;
    }
    if (trackPoints.length > 0) {
      const lastPoint = trackPoints[trackPoints.length - 1];
      return [lastPoint.latitude, lastPoint.longitude];
    }
    return userLocation;
  };

  const getPolylinePoints = () => {
    return trackPoints.map(point => [point.latitude, point.longitude]);
  };
  const getPolylineImportPoints = () => {
    return importPoints.map(point => [point.latitude, point.longitude]);
  };
  const startAutoRecording = () => {
    const interval = setInterval(recordPoint, 10000); // Records every 10 seconds
    setRecordingInterval(interval);
  };

  const stopAutoRecording = () => {
    if (recordingInterval) {
      clearInterval(recordingInterval);
      setRecordingInterval(null);
    }
  };
  const startTracking = () => {
    setTrackPoints([]);
    setIsTracking(true);
    setTrackingStatus('tracking');
    startAutoRecording();
  };

  const pauseTracking = () => {
    setIsTracking(false);
    setTrackingStatus('paused');
    stopAutoRecording();
  };

  const resumeTracking = () => {
    setIsTracking(true);
    setTrackingStatus('tracking');
    startAutoRecording();
  };

  const stopTracking = () => {
    setIsTracking(false);
    setTrackingStatus('idle');
    stopAutoRecording();
  };

  const shouldRecordNewPoint = (newPosition: GeolocationPosition): boolean => {
    if (!autoRecordingSettings.lastRecordedPosition) return true;

    const timeDiff = (newPosition.timestamp - autoRecordingSettings.lastRecordedPosition.timestamp) / 1000;
    if (timeDiff < autoRecordingSettings.minTime) return false;

    const distance = calculateDistance(
      autoRecordingSettings.lastRecordedPosition.latitude,
      autoRecordingSettings.lastRecordedPosition.longitude,
      newPosition.coords.latitude,
      newPosition.coords.longitude
    ) * 1000; // Convert km to meters

    return distance >= autoRecordingSettings.minDistance;
  };

  const shareTrack = () => {
    const shareUrl = `${window.location.origin}/track/${trackId}`;
    navigator.clipboard.writeText(shareUrl);
  };

  function RecenterOnImport() {
    const map = useMap();

    useEffect(() => {
      if (importPoints.length > 0 && !initialCenterAfterImportDone) {
        const firstPoint = importPoints[0];
        map.setView([firstPoint.latitude, firstPoint.longitude], 13);
        setInitialCenterAfterImportDone(true);
      }
    }, [importPoints]);

    return null;
  }

  const recordPoint = () => {
    setShowNotice(false);

    if (recordingMode === 'manual') {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setPendingPosition(position);
            setShowCommentModal(true);
          },
          (error) => showNotification('Error getting location:', "error"),
          {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0,
          }
        );
      }
    } else {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (recordingMode === 'auto' && !shouldRecordNewPoint(position)) {
              return;
            }

            const newPoint: TrackPoint = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              timestamp: position.timestamp,
              elevation: position.coords.altitude || undefined,
              comment: '',
            };

            setTrackPoints((prev) => [...prev, newPoint]);
            setAutoRecordingSettings(prev => ({
              ...prev,
              lastRecordedPosition: newPoint
            }));
          },
          (error) => showNotification('Error getting location:', "error"),
          {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0,
          }
        );
      }
    }
  };

  const savePointWithComment = async (data: {
    comment: string,
    cloudEnabled: boolean,
    isIncident: boolean,
    isPrivate: boolean,
    photo: File | undefined,
  }) => {
    let photoAsset;
    if (data.photo && data.cloudEnabled) {
      const photoFile = new File([data.photo], `${trackId}_${Date.now()}.jpg`, { type: data.photo.type });
      photoAsset = await uploadFile({
        collection: "photos",
        data: photoFile
      });
    }
    if (pendingPosition) {
      const newPoint: TrackPoint = {
        latitude: pendingPosition.coords.latitude,
        longitude: pendingPosition.coords.longitude,
        timestamp: pendingPosition.timestamp,
        elevation: pendingPosition.coords.altitude || undefined,
        comment: data.comment.trim() || undefined,
        photo: photoAsset ? photoAsset.downloadUrl : undefined
      };

      //--save to local first
      setTrackPoints((prev) => [...prev, newPoint]);
      //save to  IndexDB
      const updatedPoints = [...trackPoints, newPoint];
      await saveTrackPointsToIndexDB(trackId, updatedPoints);
      setPendingPosition(null);
      // showNotification('Point recorded successfully', 'success');
      setAutoCenter(true);
      setTimeout(() => setAutoCenter(false), 100);

      if (data.cloudEnabled) {
        if (data.isIncident) {
          const result = await setDoc({
            collection: "incidents",
            doc: {
              key: `${trackId}_${pendingPosition.timestamp}`,
              data: newPoint
            }
          });
        }
        if (data.isPrivate && userSettings?.trackPointCollection) {
          const result = await setDoc({
            satellite: { satelliteId: userSettings?.storageId },
            collection: userSettings.trackPointCollection,
            doc: {
              key: `${trackId}_${pendingPosition.timestamp}`,
              data: newPoint
            }
          });
        } else {
          const result = await setDoc({
            collection: "live_tracks",
            doc: {
              key: `${trackId}_${pendingPosition.timestamp}`,
              data: newPoint
            }
          });
          setHasCloudPoints(true);
        }

      }


    }

  };
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const content = await file.text();
    let points: TrackPoint[] = [];

    if (file.name.endsWith('.csv')) {
      points = parseCSV(content);
    } else if (file.name.endsWith('.gpx')) {
      points = parseGPX(content);
    } else if (file.name.endsWith('.kml')) {
      points = parseKML(content);
    }

    setImportPoints(points);
  };

  const clearPoints = () => {
    const confirmed = window.confirm("Are you sure you want to clear all track points? This action cannot be undone.");
    if (confirmed) {
      Cookies.remove('lastTrackId');
      setTrackId(null)
      setTrackPoints([]);
      showNotification('Track cleared', 'success');
    }
  };

  const [showExportModal, setShowExportModal] = useState(false);

  const handleExport = async (
    format: string,
    storage: 'local' | 'cloud',
    filename: string,
    description: string,
    eventId: string,
    isPrivateStorage: boolean
  ) => {
    let content: string;
    let mimeType: string;
    setIsExporting(true);
    try {
      switch (format) {
        case 'gpx':
          content = generateGPX(trackPoints);
          mimeType = 'application/gpx+xml';
          break;
        case 'kml':
          content = generateKML(trackPoints);
          mimeType = 'application/vnd.google-earth.kml+xml';
          break;
        default:
          const header = 'timestamp,latitude,longitude,elevation,comment\n';
          content = header + trackPoints.map(point =>
            `${point.timestamp},${point.latitude},${point.longitude},${point.elevation || ''},${point.comment || ''}`
          ).join('\n');
          mimeType = 'text/csv';
      }

      const expfilename = `${eventId}_${trackPoints[0].timestamp}.${format}`;

      if (storage === 'local') {
        const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
        saveAs(blob, expfilename);
        showNotification(`Track exported as ${format.toUpperCase()}`, 'success');

      } else {

        const blob = new Blob([content], { type: mimeType });
        const file = new File([blob], expfilename, { type: mimeType });

        // Use private storage if selected and available
        const uploadOptions = isPrivateStorage && userSettings?.storageId ? {
          satellite: { satelliteId: userSettings.storageId },
          collection: userSettings.trackFileCollection,
          data: file
        } : {
          collection: "tracks",
          data: file
        };

        const savedAsset = await uploadFile(uploadOptions);
        showNotification(`Uploaded track file`, 'success');

        const totalDistance = getTotalDistance();
        const duration = getDuration();
        const elevationGain = getElevationGain();
        const speedKmh = totalDistance / duration;

        if (savedAsset) {
          const fileRef = savedAsset.downloadUrl;
          const docData = {
            eventId,
            filename: filename,
            description: description,
            startime: new Date(trackPoints[0].timestamp).toLocaleString(),
            endtime: new Date(trackPoints[trackPoints.length - 1].timestamp).toLocaleString(),
            trackfile: fileRef,
            distance: totalDistance,
            duration: duration,
            elevationGain: elevationGain
          };

          // Save metadata to private or public collection
          const docOptions = isPrivateStorage && userSettings?.storageId ? {
            satellite: { satelliteId: userSettings.storageId },
            collection: userSettings.trackFileCollection,
            doc: {
              key: eventId + "_" + new Date().getTime(),
              data: docData
            }
          } : {
            collection: "tracks",
            doc: {
              key: eventId + "_" + new Date().getTime(),
              data: docData
            }
          };

          await setDoc(docOptions);
          showNotification('created track record', 'success');


          //update userstate when it's public and long enough
          if (!isPrivateStorage && totalDistance >= 1 && speedKmh <= 7) {
            const userStats = await loadUserStats();
            if (userStats) {
              const updatedStats = {
                totalDistance: userStats.data.totalDistance + totalDistance,
                totalHours: userStats.data.totalHours + duration,
                totalElevation: userStats.data.totalElevation + elevationGain,
                completedTrails: userStats.data.completedTrails + 1,
                firstHikeDate: userStats.data.firstHikeDate || new Date(trackPoints[0].timestamp).toLocaleDateString(),
              };
              await setDoc({
                collection: "stats",
                doc: {
                  ...userStats,
                  data: updatedStats
                }
              });
              showNotification('updated user stats', 'success');
            } else {
              await setDoc({
                collection: "stats",
                doc: {
                  key: user.key,
                  data: {
                    totalDistance: totalDistance,
                    totalHours: duration,
                    totalElevation: elevationGain,
                    completedTrails: 1,
                    firstHikeDate: new Date(trackPoints[0].timestamp).toLocaleDateString(),
                  }
                }
              });
              showNotification('created user stats', 'success');
            }
          } else {
            showNotification('it is not valid hiking track', 'error');
          }

          showNotification('Track uploaded to cloud storage', 'success');
          
          clearPoints();
        } else {
          showNotification('Failed to upload track file', 'error');
        }

      }//cloud storage
    } catch (error) {
      showNotification(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const loadUserStats = async () => {
    if (user?.key) {
      const stats = await getDoc<UserStats>({
        collection: "stats",
        key: user.key
      });

      if (stats?.data) {
        return stats;
      }
    }
  };
  const handleStartTrack = (trackSettings: {
    trackId: string;
    recordingMode: 'manual' | 'auto';
    autoRecordingSettings: {
        minTime: number;
        maxTime: number;
        minDistance: number;
    }
  }) => {
    Cookies.set('lastTrackId', trackSettings.trackId, { expires: 7 }); 
    setTrackId(trackSettings.trackId);
    setRecordingMode(trackSettings.recordingMode);
    setAutoRecordingSettings({...trackSettings.autoRecordingSettings,lastRecordedPosition: null});
    setShowStartModal(false);
    if (trackSettings.recordingMode === 'auto') {
      startTracking();
    }
  };
 
  return (
    <div className="App">
      <Navbar />
      <header className="App-header">

        {locationError && (
          <div className="location-error">
            {locationError}
          </div>
        )}

        {!trackId && <div className="controls">
          <button onClick={() => setShowStartModal(true)}>Start Track</button>
        </div>}
   
        {!showStartModal && trackId && <div className="controls">
          {recordingMode === 'manual' ? (
            <button onClick={recordPoint}>
              Record Point
            </button>
          ) : (
            <div className="auto-controls">
              {trackingStatus === 'idle' && (
                <button onClick={startTracking}>Start</button>
              )}
              {trackingStatus === 'tracking' && (
                <button onClick={pauseTracking}>Pause </button>
              )}
              {trackingStatus === 'paused' && (
                <button onClick={resumeTracking}>Resume</button>
              )}
              {(trackingStatus === 'tracking' || trackingStatus === 'paused') && (
                <button onClick={stopTracking}>Stop</button>
              )}
            </div>
          )}
        </div>}

        {trackPoints.length > 0 &&
          <div className="stats">

            <p>Start time: {new Date(trackPoints[0].timestamp).toLocaleString()}</p>
            <p>Duration: {getDuration().toFixed(2)} hours</p>
            <p>Distance: {getTotalDistance().toFixed(2)} km</p>
            <p>Elevation Gain: {getElevationGain().toFixed(1)} m</p>
            <p
              onClick={() => setShowPointsModal(true)}
              className="points-count-link"
            >
              Recorded Points: <span className="clickable-count">{trackPoints.length}</span>

            </p>
            {user && hasCloudPoints && <a href={'/live/' + trackId} target="_blank">Live</a>}

          </div>}

        {viewMode === 'map' ? (
          <div className="map-container">
            <MapContainer
              center={getMapCenter() as [number, number]}
              zoom={9}
              style={{ height: '400px', width: '100%' }}
            >
              {autoCenter && <RecenterMap position={userLocation} />}
              <RecenterOnImport />
              <TileLayer
                url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                attribution=''
                maxZoom={17}
              />
              <div className="leaflet-top leaflet-left custom-controls">
                <div className="leaflet-control leaflet-bar">
                  <a
                    href="#"
                    className={`leaflet-control-button ${autoCenter ? 'active' : ''}`}
                    onClick={(e) => {
                      e.preventDefault()
                      setAutoCenter(!autoCenter)
                    }}
                    title="Auto Center"
                  >
                    <span className="material-icons">my_location</span>
                  </a>
                  <a
                    href="#"
                    className={`leaflet-control-button ${showPoints ? 'active' : ''}`}
                    onClick={(e) => {
                      e.preventDefault()
                      setShowPoints(!showPoints)
                    }}
                    title="Show Points"
                  >
                    <span className="material-icons">place</span>
                  </a>
                </div>
              </div>

              {showPoints && trackPoints.map((point, index) => (
                <Marker
                  key={point.timestamp}
                  position={[point.latitude, point.longitude]}
                  icon={defaultIcon}
                />
              ))}
              {userLocation && <Marker
                position={userLocation}
                icon={currentLocationIcon}
              />}

              <Polyline
                positions={getPolylinePoints() as [number, number][]}
                color="red"
              />
              <Polyline
                positions={getPolylineImportPoints() as [number, number][]}
                color="green"
              />
            </MapContainer>

          </div>
        ) : (
          <div className="list-container">
            <table className="points-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Latitude</th>
                  <th>Longitude</th>
                  <th>Elevation</th>
                  <th>Comment</th>
                </tr>
              </thead>
              <tbody>
                {trackPoints.map((point, index) => (
                  <tr key={point.timestamp}>
                    <td>{new Date(point.timestamp).toLocaleTimeString()}</td>
                    <td>{point.latitude.toFixed(6)}</td>
                    <td>{point.longitude.toFixed(6)}</td>
                    <td>{point.elevation?.toFixed(1) || '-'}</td>
                    <td>{point.comment || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="bottom-controls">
          <input
            type="file"
            accept=".csv,.gpx,.kml"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
            id="file-upload"
          />
          <button onClick={() => document.getElementById('file-upload')?.click()}>
            Import
          </button>
          <button onClick={() => setShowExportModal(true)} disabled={trackPoints.length < 2 || isExporting}>
            Export
          </button>

          <button onClick={clearPoints} disabled={!trackId && (trackPoints.length === 0 || isExporting)}>
            Clear
          </button>
        </div>

      </header>
      <div className="feature-highlights">
        <div className="feature-card">
          <span className="material-icons">location_history</span>
          <h3>Track Your Journey</h3>
          <p>Record your path and revisit where you've been</p>
        </div>

        <div className="feature-card">
          <span className="material-icons">share_location</span>
          <h3>Live Location Sharing</h3>
          <p>Keep family updated with your real-time location</p>
        </div>

        <div className="feature-card">
          <span className="material-icons">warning</span>
          <h3>Incident Reporting</h3>
          <p>Mark and share important points of interest or hazards</p>
        </div>
      </div>


      <footer className="home-footer">
        <a
          href="/guide"
          className="guide-link"
        >
          <span className="material-icons">help_outline</span>
          User Guide
        </a>
        <a
          href="#"
          className="feedback-link"
          onClick={(e) => {
            e.preventDefault();
            setShowFeedbackModal(true);
          }}
        >
          <span className="material-icons">feedback</span>
          Feedback
        </a>

      </footer>


      <FeedbackModal
        isOpen={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        user={user}
        showNotification={showNotification}
      />

      {showCommentModal && (
        <CommentModal
          onSave={(data) => {
            savePointWithComment(data);
            setShowCommentModal(false);
          }}
          onClose={() => {
            setShowCommentModal(false);
            setPendingPosition(null);
          }}
          user={user}
        />
      )}

      {showExportModal && (
        <ExportModal
          onExport={handleExport}
          onClose={() => setShowExportModal(false)}
          user={user}
          trackId={trackId} 
        />
      )}
      {showPointsModal && (
        <TrackPointsModal
          points={trackPoints}
          onClose={() => setShowPointsModal(false)}
        />
      )}
      {showStartModal && (
        <StartTrackModal
          onClose={() => setShowStartModal(false)}
          onStart={handleStartTrack}
        />
      )}
    </div>
  );
}

export default MainApp;



