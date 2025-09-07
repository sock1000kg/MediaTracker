import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

interface MediaTypeCardProps {
    type: string,
    children: React.ReactNode
}

// Cards with media type as header, renders whatever children that is in it (basically sorting the children by type)
export function MediaTypeCard({ type, children }: MediaTypeCardProps) {
    return ( 
            <Card key={type} className="bg-transparent border-none shadow-none">

                {/* Meidia Type Header */}
                <CardHeader className="flex flex-row justify-between items-center">
                    <h2 className="text-2xl font-bold text-stone-800 capitalize">{type}</h2>
                </CardHeader>


                <CardContent className="space-y-4">
                    {children}
                </CardContent>
                <Separator className="bg-stone-300"/>
            </Card>
    )
}