import { useState } from "react"

import { Button } from "@/components/ui/button"
import LogsSection from "@/components/sections/LogSection"
import MediasSection from "@/components/sections/MediaSection"
import MediaTypesSection from "@/components/sections/MediaTypeSection"
import SearchSection from "@/components/sections/SearchSection"
import Settings from "@/components/sections/Settings"

import { Search } from "lucide-react"

export type Tab = "logs" | "medias" | "mediaTypes" | "search" | "settings" //Tabs in homepage

export default function Homepage() {
  const [activeTab, setActiveTab] = useState<Tab>("logs")

  return (
    <>
      <div className="flex h-screen bg-stone-100"> 
        {/* Display user's contents */}
        <div className="flex-1 space-y-4 overflow-hidden">
          {activeTab === "logs" && <LogsSection/>}
          {activeTab === "medias" && <MediasSection />}
          {activeTab === "mediaTypes" && <MediaTypesSection />}
          {activeTab === "search" && <SearchSection/>}
          {activeTab === "settings" && <Settings/>}
        </div>

        {/* Right side bar */}
        <div className="flex flex-col w-40 bg-stone-300">
          <Button 
            variant={activeTab === "search" ? "boldedLink" : "link"}
            className="text-stone-600 w-full rounded-none shadow-[0_2px_2px_-2px_rgba(0,0,0,0.2)] hover:underline" 
            onClick={() => { setActiveTab("search")}}
          >
              <Search /> Search
          </Button>
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
          <Button 
            variant={activeTab === "settings" ? "boldedLink" : "link"}
            className="text-stone-600 w-full rounded-none shadow-[0_2px_2px_-2px_rgba(0,0,0,0.2)] hover:underline" 
            onClick={() => { setActiveTab("settings")}}
          >
              Settings
          </Button>
        </div>
      </div>
    </>
  )
}
