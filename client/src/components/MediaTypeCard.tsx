import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

interface MediaTypeCardProps {
    type: string,
    children: React.ReactNode
}

export function MediaTypeCard({ type, children }: MediaTypeCardProps) {
    return ( 
        <Card key={type} className="bg-transparent border-none shadow-none">

            {/* Meidia Type Header */}
            <CardHeader className="flex flex-row justify-between items-center">
                <h2 className="text-2xl font-bold text-stone-800 capitalize">{type}</h2>
                <Button size="sm" variant="amber">
                    Add {type}
                </Button>
            </CardHeader>

            <Separator className="bg-stone-300"/>

            <CardContent className="space-y-4">
                {children}
            </CardContent>
        </Card>
    )
}