import { useState } from "react"

import { Button } from "@/components/ui/button"
import LogsSection from "@/components/sections/LogSection"
import MediasSection from "@/components/sections/MediaSection"
import MediaTypesSection from "@/components/sections/MediaTypeSection"

import type { Tab } from "@/types/media.ts"

export default function Homepage() {
  const [activeTab, setActiveTab] = useState<Tab>("logs")

  return (
    <>
        <div className="flex min-h-screen bg-stone-100"> 

          {/* Display user's contents */}
          <div className="flex-1">
            {activeTab === "logs" && <LogsSection/>}
            {activeTab === "medias" && <MediasSection />}
            {activeTab === "mediaTypes" && <MediaTypesSection />}
          </div>

          {/* Right side bar */}
          <div className="flex flex-col w-40 bg-stone-300">
            <Button 
              variant={activeTab === "logs" ? "boldedLink" : "link"}
              className="text-stone-600 w-full rounded-none shadow-[0_2px_2px_-2px_rgba(0,0,0,0.2)] hover:underline" 
              onClick={() => { setActiveTab("logs")}}
            >
                Your Logs
            </Button>
            <Button 
              variant={activeTab === "medias" ? "boldedLink" : "link"}
              className="text-stone-600 w-full rounded-none shadow-[0_2px_2px_-2px_rgba(0,0,0,0.2)] hover:underline" 
              onClick={() => { setActiveTab("medias")}}
            >
                Your Medias
            </Button>
            <Button 
              variant={activeTab === "mediaTypes" ? "boldedLink" : "link"}
              className="text-stone-600 w-full rounded-none shadow-[0_2px_2px_-2px_rgba(0,0,0,0.2)] hover:underline" 
              onClick={() => { setActiveTab("mediaTypes")}}
            >
                Your Media Types
            </Button>
          </div>
        </div>
    </>
  )
}
