import { useVideoPlayer } from '@/lib/video';
import { AnimatePresence, motion } from 'framer-motion';

import { Scene1FeedEmpty } from './video_scenes/Scene1FeedEmpty';
import { Scene2Settings } from './video_scenes/Scene2Settings';
import { Scene3FeedLoaded } from './video_scenes/Scene3FeedLoaded';
import { Scene4Compose } from './video_scenes/Scene4Compose';
import { Scene5AIRephrase } from './video_scenes/Scene5AIRephrase';
import { Scene6Success } from './video_scenes/Scene6Success';
import { Scene7Outro } from './video_scenes/Scene7Outro';

const SCENE_DURATIONS = {
  feedEmpty: 5000,
  settingsTags: 7000,
  feedLoaded: 8000,
  composePost: 6000,
  aiRephrase: 8000,
  success: 6000,
  outro: 6000,
};

export default function VideoTemplate() {
  const { currentScene } = useVideoPlayer({
    durations: SCENE_DURATIONS,
  });

  return (
    <div className="w-full h-screen overflow-hidden relative bg-[#0D0D14] flex items-center justify-center font-sans text-white">
      {/* Dynamic Background Effects */}
      <motion.div 
        className="absolute w-[80vw] h-[80vw] rounded-full bg-[#6C5CE7] blur-[150px] pointer-events-none"
        animate={{
          x: currentScene % 2 === 0 ? '5vw' : '-5vw',
          y: currentScene % 3 === 0 ? '5vh' : '-5vh',
          scale: currentScene === 6 ? 1.5 : 1,
          opacity: currentScene === 6 ? 0.3 : 0.15,
        }}
        transition={{ duration: 5, ease: "easeInOut" }}
      />
      
      {/* Phone Mockup Wrapper */}
      <motion.div
        className="relative z-10 w-[42vh] h-[88vh] rounded-[3rem] border-[8px] border-[#2A2A35] bg-[#0D0D14] shadow-2xl flex flex-col overflow-hidden"
        animate={{
          scale: currentScene === 6 ? 0.9 : 1,
          opacity: currentScene === 6 ? 0 : 1,
          y: currentScene === 6 ? 50 : 0
        }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Notch */}
        <div className="absolute top-0 inset-x-0 h-7 flex justify-center z-50">
          <div className="w-28 h-6 bg-[#2A2A35] rounded-b-2xl"></div>
        </div>

        <div className="relative flex-1 overflow-hidden">
          <AnimatePresence mode="popLayout">
            {currentScene === 0 && <Scene1FeedEmpty key="s1" />}
            {currentScene === 1 && <Scene2Settings key="s2" />}
            {currentScene === 2 && <Scene3FeedLoaded key="s3" />}
            {currentScene === 3 && <Scene4Compose key="s4" />}
            {currentScene === 4 && <Scene5AIRephrase key="s5" />}
            {currentScene === 5 && <Scene6Success key="s6" />}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Outro Scene (renders over everything) */}
      <AnimatePresence>
        {currentScene === 6 && <Scene7Outro key="s7" />}
      </AnimatePresence>
    </div>
  );
}