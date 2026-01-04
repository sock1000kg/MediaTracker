import { useState } from "react"

import { Button } from "@/components/ui/button"
import LogsSection from "@/pages/sections/LogSection"
import MediasSection from "@/pages/sections/MediaSection"
import MediaTypesSection from "@/pages/sections/MediaTypeSection"
import BooksSearchSection from "@/pages/sections/BookSearchSection"
import MusicSearchSection from "@/pages/sections/MusicSearchSection"
import Settings from "@/pages/sections/Settings"

import { Search } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type Tab = "logs" | "medias" | "mediaTypes" | "settings" | "bookSearch" | "musicSearch" | "defaultSearch" //Tabs in homepage

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
          {activeTab === "bookSearch" && <BooksSearchSection />}
          {activeTab === "musicSearch" && <MusicSearchSection />}
          {activeTab === "settings" && <Settings/>}
        </div>

        {/* Right side bar */}
        <div className="flex flex-col w-30 bg-stone-300">
          {/* Search Select */}
          <Select 
            onValueChange={(val: Tab) => setActiveTab(val)} 
            value={activeTab.startsWith("book") || activeTab.startsWith("music") ? activeTab : "defaultSearch"}
          >
            <SelectTrigger className="w-full border-0 text-stone-600 rounded-none hover:underline">
              <SelectValue placeholder="Search" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="defaultSearch" disabled className="text-gray-400">
                <Search className="inline mr-2" /> Search
              </SelectItem>
              <SelectItem value="bookSearch">
                <Search className="inline mr-2" /> Books
              </SelectItem>
              <SelectItem value="musicSearch">
                <Search className="inline mr-2" /> Music
              </SelectItem>
            </SelectContent>
          </Select>

          <Button 
            variant={activeTab === "logs" ? "boldedLink" : "link"}
            className="text-stone-600 w-full rounded-none shadow-[0_2px_2px_-2px_rgba(0,0,0,0.2)] hover:underline" 
            onClick={() => { setActiveTab("logs")}}
          >
              Logs
          </Button>
          <Button 
            variant={activeTab === "medias" ? "boldedLink" : "link"}
            className="text-stone-600 w-full rounded-none shadow-[0_2px_2px_-2px_rgba(0,0,0,0.2)] hover:underline" 
            onClick={() => { setActiveTab("medias")}}
          >
              Medias
          </Button>
          <Button 
            variant={activeTab === "mediaTypes" ? "boldedLink" : "link"}
            className="text-stone-600 w-full rounded-none shadow-[0_2px_2px_-2px_rgba(0,0,0,0.2)] hover:underline" 
            onClick={() => { setActiveTab("mediaTypes")}}
          >
              Media Types
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
