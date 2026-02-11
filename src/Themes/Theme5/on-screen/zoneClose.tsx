import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { io, Socket } from "socket.io-client";

interface ZoneCloseProps {
  tournament: any;
  round?: any;
  match?: any;
  matchData?: any;
}

const ZoneClose: React.FC<ZoneCloseProps> = ({ tournament, round, match }) => {
  const [circleInfo, setCircleInfo] = useState<any>({});
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [maxTime, setMaxTime] = useState<number>(0);
  const [previousCircleIndex, setPreviousCircleIndex] = useState<number | null>(null);
  const [timerStarted, setTimerStarted] = useState<boolean>(false);
  const [currentStatus, setCurrentStatus] = useState<number | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [dataReceived, setDataReceived] = useState<boolean>(false);

  // Refs to prevent loops (similar to Dom.tsx)
  const prevDataRef = useRef<any>({});
  const circleInfoRef = useRef<any>({});
  const timerEndTimeRef = useRef<number | null>(null);

  const memoizedCircleInfo = useMemo(() => circleInfo, [circleInfo.CircleIndex]);

  // Handle socket updates with loop prevention (similar to Dom.tsx)
  useEffect(() => {
    circleInfoRef.current = circleInfo;
  }, [circleInfo]);

  // Socket update handler (no loop)
  const handleSocketUpdate = useCallback((data: any, freshSocket?: any) => {
    const dataHash = JSON.stringify(data);

    if (JSON.stringify(data) === JSON.stringify(prevDataRef.current)) {
      console.log('ZoneClose: Ignoring duplicate data');
      return;
    }

    prevDataRef.current = data;

    console.log('ZoneClose: Received circleInfoUpdate:', data);
    setCurrentStatus(data.CircleStatus);
    if (parseInt(data.CircleStatus) === 2) {
      console.log('ZoneClose: Circle status is 2, stopping socket emissions');
      // Disconnect socket when status is 2
      if (freshSocket && freshSocket.connected) {
        freshSocket.off('circleInfoUpdate', handleSocketUpdate);
        freshSocket.disconnect();
        setSocket(null);
      }
      return;
    }
    if (!dataReceived) {
      setDataReceived(true);
      setCircleInfo(data);
      setPreviousCircleIndex(data.CircleIndex);
      if (data.MaxTime) {
        const maxTimeValue = parseInt(data.MaxTime);
        setMaxTime(maxTimeValue);
        setTimeLeft(maxTimeValue);
        timerEndTimeRef.current = Date.now() + (maxTimeValue * 1000);
      }
      console.log('ZoneClose: Initial data received and set');
      // Stop listening after initial data
      if (freshSocket) {
        freshSocket.off('circleInfoUpdate', handleSocketUpdate);
        freshSocket.disconnect();
        setSocket(null);
      }
    } else if (parseInt(data.CircleIndex) !== previousCircleIndex) {
      console.log('ZoneClose: Setting circle info state');
      setCircleInfo(data);
      setPreviousCircleIndex(parseInt(data.CircleIndex));
      // Only reset timer if MaxTime has changed
      const newMaxTime = parseInt(data.MaxTime);
      if (!isNaN(newMaxTime) && newMaxTime !== maxTime) {
        setMaxTime(newMaxTime);
        setTimeLeft(newMaxTime);
        timerEndTimeRef.current = Date.now() + (newMaxTime * 1000);
      }
      console.log('ZoneClose: State updated, current circleInfo:', data);
    } else {
      console.log('ZoneClose: Ignoring update - circle index unchanged');
    }
  }, [dataReceived, previousCircleIndex, maxTime]);

  // Socket setup — only runs once per match
  useEffect(() => {
    if (!match?._id || socket) return;

    console.log('Setting up zone close listeners for match:', match._id);

    const freshSocket = io("https://backend-prod-6uuq.onrender.com", {
      transports: ["websocket", "polling"],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    setSocket(freshSocket);
    console.log('Socket connected for zone close:', freshSocket?.connected);

    const socketHandler = (data: any) => {
      handleSocketUpdate(data, freshSocket);
    };

    freshSocket.on('circleInfoUpdate', socketHandler);
    console.log('ZoneClose: Listener attached for circleInfoUpdate');

    return () => {
      if (freshSocket && freshSocket.connected) {
        console.log('ZoneClose: Cleaning up socket listeners');
        freshSocket.off('circleInfoUpdate', socketHandler);
        freshSocket.disconnect();
        setSocket(null);
      }
    };
  }, [match?._id, socket]);

  useEffect(() => {
    if (maxTime > 0 && timerEndTimeRef.current) {
      console.log('ZoneClose: Starting real-time timer with maxTime:', maxTime);
      const interval = setInterval(() => {
        const now = Date.now();
        const remaining = Math.max(0, Math.ceil((timerEndTimeRef.current! - now) / 1000));
        setTimeLeft(remaining);

        if (remaining <= 0) {
          clearInterval(interval);
          setTimerStarted(false);
          timerEndTimeRef.current = null;
          console.log('ZoneClose: Real-time timer finished');
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [maxTime]);

  const progressWidth = maxTime > 0 ? (timeLeft / maxTime) * 100 : 0;
  const dynamicColor = timeLeft > maxTime * 0.5 ? 'bg-green-500' : timeLeft > maxTime * 0.25 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="w-[1920px] h-[1080px] flex items-center justify-center bg-black text-white relative">
      <div className="absolute top-0 left-0 w-full h-20 bg-black flex items-center justify-center">
        <div className="w-3/4 h-10 bg-gray-700 rounded">
          <div
            className={`h-full ${dynamicColor} rounded transition-all duration-1000`}
            style={{ width: `${progressWidth}%` }}
          ></div>
        </div>
      </div>
      <div className="text-center">
        <h1 className="text-6xl font-bold mb-8">ZONE CLOSE INFO</h1>
        <div className="text-4xl space-y-4">
          <div>Game Time: {memoizedCircleInfo?.GameTime || 'N/A'}</div>
          <div>Circle Status: {currentStatus !== null ? currentStatus : 'N/A'}</div>
          <div>Circle Index: {memoizedCircleInfo?.CircleIndex || 'N/A'}</div>
          <div>Counter: {memoizedCircleInfo?.Counter || 'N/A'}</div>
          <div>Max Time: {memoizedCircleInfo?.MaxTime || 'N/A'}</div>
          <div>Time Left: {timeLeft}s</div>
        </div>
      </div>
    </div>
  );
};

export default ZoneClose;
