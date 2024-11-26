import React, { useState, useEffect } from 'react';
import { Principal } from '@dfinity/principal';
import { useParams } from 'react-router-dom';
import { TrackPoint } from '../types/TrackPoint';
import { listDocs, getDoc } from "@junobuild/core";
import 'leaflet/dist/leaflet.css';
import 'leaflet/dist/images/marker-shadow.png';

import { Navbar } from '../components/Navbar';
import { TimelineMapView } from '../components/TimelineMapView';
import { TrackAchievements } from '../components/TrackAchievements';
import { UserStats } from '../types/UserStats';
import { useAlltracks, useGlobalContext } from '../components/Store';

export const UserPage: React.FC = () => {
    const { userKey } = useParams();
    const alltracks = useAlltracks();
    const { state: { isAuthed, principal } } = useGlobalContext();
    const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [startDate, setStartDate] = useState<string>(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    );
    const [endDate, setEndDate] = useState<string>(
        new Date(Date.now()).toISOString().split('T')[0]
    );
    const [userStats, setUserStats] = useState<UserStats>({
        totalDistance: 0,
        totalHours: 0,
        totalElevation: 0,
        completedTrails: 0,
        firstHikeDate: new Date().toDateString(),
    });

    useEffect(() => {

        const loadUserStats = async () => {
            const userstats = await alltracks.getUserstats(Principal.fromText(userKey))
            if (userstats.length > 0) {

                setUserStats({
                    totalDistance: userstats.totalDistance,
                    totalHours: userstats.totalHours,
                    totalElevation: userstats.totalElevation,
                    completedTrails: userstats.completedTrails,
                    firstHikeDate: userstats.firstHikeDate,
                });
            }else{
                setUserStats({
                    totalDistance: 0,
                    totalHours: 0,
                    totalElevation: 0,
                    completedTrails: 0,
                    firstHikeDate: new Date().toDateString(),
                });
            }
        };

        if (userKey) {
            loadUserStats();
        }
    }, [userKey]);

    const loadTrackPoints = async () => {
        setIsLoading(true);
        const start = BigInt(new Date(startDate).getTime() * 1000000);
        const end = BigInt(new Date(endDate + ' ' + new Date(Date.now()).toISOString().split('T')[1]).getTime() * 1000000);

        const result = await alltracks.getCheckpoints({ user: Principal.fromText(userKey) });

        if (result.length > 0) {
            const points = result.map(point => ({
                latitude: point.latitude,
                longitude: point.longitude,
                timestamp: Number(point.timestamp)  ,
                elevation: point.elevation,
                comment: point.note.length ? point.note[0] : '',
                photo: point.photo.length > 0 ? point.photo[0] : undefined,
            }));
            console.log(points)
            setTrackPoints(points);
        }

        setTrackPoints(result);
        setIsLoading(false);
    };

    useEffect(() => {
        loadTrackPoints();
    }, [userKey]);

    return (
        <div>
            <Navbar />
            <TrackAchievements stats={userStats} />
            <TimelineMapView
                trackPoints={trackPoints}
                isLoading={isLoading}
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
                onLoadPoints={loadTrackPoints}
            />
        </div>
    );
};
