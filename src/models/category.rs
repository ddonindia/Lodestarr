//! Torznab category definitions
//! Based on Newznab/Torznab standard categories

use serde::{Deserialize, Serialize};

/// A Torznab category
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: i32,
    pub name: &'static str,
    pub description: &'static str,
}

/// Standard Torznab categories
pub static CATEGORIES: &[Category] = &[
    // Console
    Category {
        id: 1000,
        name: "Console",
        description: "Console games",
    },
    Category {
        id: 1010,
        name: "Console/NDS",
        description: "Nintendo DS",
    },
    Category {
        id: 1020,
        name: "Console/PSP",
        description: "PlayStation Portable",
    },
    Category {
        id: 1030,
        name: "Console/Wii",
        description: "Nintendo Wii",
    },
    Category {
        id: 1040,
        name: "Console/Xbox",
        description: "Xbox",
    },
    Category {
        id: 1050,
        name: "Console/Xbox360",
        description: "Xbox 360",
    },
    Category {
        id: 1060,
        name: "Console/Wiiware",
        description: "WiiWare",
    },
    Category {
        id: 1070,
        name: "Console/Xbox360DLC",
        description: "Xbox 360 DLC",
    },
    Category {
        id: 1080,
        name: "Console/PS3",
        description: "PlayStation 3",
    },
    Category {
        id: 1090,
        name: "Console/Other",
        description: "Other consoles",
    },
    Category {
        id: 1110,
        name: "Console/3DS",
        description: "Nintendo 3DS",
    },
    Category {
        id: 1120,
        name: "Console/PSVita",
        description: "PlayStation Vita",
    },
    Category {
        id: 1130,
        name: "Console/WiiU",
        description: "Nintendo Wii U",
    },
    Category {
        id: 1140,
        name: "Console/XboxOne",
        description: "Xbox One",
    },
    Category {
        id: 1180,
        name: "Console/PS4",
        description: "PlayStation 4",
    },
    // Movies
    Category {
        id: 2000,
        name: "Movies",
        description: "Movies",
    },
    Category {
        id: 2010,
        name: "Movies/Foreign",
        description: "Foreign movies",
    },
    Category {
        id: 2020,
        name: "Movies/Other",
        description: "Other movies",
    },
    Category {
        id: 2030,
        name: "Movies/SD",
        description: "SD movies",
    },
    Category {
        id: 2040,
        name: "Movies/HD",
        description: "HD movies",
    },
    Category {
        id: 2045,
        name: "Movies/UHD",
        description: "4K/UHD movies",
    },
    Category {
        id: 2050,
        name: "Movies/BluRay",
        description: "BluRay movies",
    },
    Category {
        id: 2060,
        name: "Movies/3D",
        description: "3D movies",
    },
    Category {
        id: 2070,
        name: "Movies/DVD",
        description: "DVD movies",
    },
    Category {
        id: 2080,
        name: "Movies/WEBDL",
        description: "WEB-DL movies",
    },
    Category {
        id: 2090,
        name: "Movies/x265",
        description: "x265/HEVC movies",
    },
    // Audio
    Category {
        id: 3000,
        name: "Audio",
        description: "Audio",
    },
    Category {
        id: 3010,
        name: "Audio/MP3",
        description: "MP3",
    },
    Category {
        id: 3020,
        name: "Audio/Video",
        description: "Music videos",
    },
    Category {
        id: 3030,
        name: "Audio/Audiobook",
        description: "Audiobooks",
    },
    Category {
        id: 3040,
        name: "Audio/Lossless",
        description: "Lossless audio",
    },
    Category {
        id: 3050,
        name: "Audio/Other",
        description: "Other audio",
    },
    Category {
        id: 3060,
        name: "Audio/Foreign",
        description: "Foreign audio",
    },
    // PC
    Category {
        id: 4000,
        name: "PC",
        description: "PC software and games",
    },
    Category {
        id: 4010,
        name: "PC/0day",
        description: "0day releases",
    },
    Category {
        id: 4020,
        name: "PC/ISO",
        description: "ISO images",
    },
    Category {
        id: 4030,
        name: "PC/Mac",
        description: "Mac software",
    },
    Category {
        id: 4040,
        name: "PC/Mobile-Other",
        description: "Mobile other",
    },
    Category {
        id: 4050,
        name: "PC/Games",
        description: "PC games",
    },
    Category {
        id: 4060,
        name: "PC/Mobile-iOS",
        description: "iOS apps",
    },
    Category {
        id: 4070,
        name: "PC/Mobile-Android",
        description: "Android apps",
    },
    // TV
    Category {
        id: 5000,
        name: "TV",
        description: "TV shows",
    },
    Category {
        id: 5010,
        name: "TV/WEB-DL",
        description: "WEB-DL TV",
    },
    Category {
        id: 5020,
        name: "TV/Foreign",
        description: "Foreign TV",
    },
    Category {
        id: 5030,
        name: "TV/SD",
        description: "SD TV",
    },
    Category {
        id: 5040,
        name: "TV/HD",
        description: "HD TV",
    },
    Category {
        id: 5045,
        name: "TV/UHD",
        description: "4K/UHD TV",
    },
    Category {
        id: 5050,
        name: "TV/Other",
        description: "Other TV",
    },
    Category {
        id: 5060,
        name: "TV/Sport",
        description: "Sports TV",
    },
    Category {
        id: 5070,
        name: "TV/Anime",
        description: "Anime",
    },
    Category {
        id: 5080,
        name: "TV/Documentary",
        description: "Documentaries",
    },
    Category {
        id: 5090,
        name: "TV/x265",
        description: "x265/HEVC TV",
    },
    // XXX
    Category {
        id: 6000,
        name: "XXX",
        description: "Adult content",
    },
    Category {
        id: 6010,
        name: "XXX/DVD",
        description: "Adult DVD",
    },
    Category {
        id: 6020,
        name: "XXX/WMV",
        description: "Adult WMV",
    },
    Category {
        id: 6030,
        name: "XXX/XviD",
        description: "Adult XviD",
    },
    Category {
        id: 6040,
        name: "XXX/x264",
        description: "Adult x264",
    },
    Category {
        id: 6045,
        name: "XXX/UHD",
        description: "Adult 4K/UHD",
    },
    Category {
        id: 6050,
        name: "XXX/Other",
        description: "Adult other",
    },
    Category {
        id: 6060,
        name: "XXX/ImageSet",
        description: "Adult image sets",
    },
    Category {
        id: 6070,
        name: "XXX/Packs",
        description: "Adult packs",
    },
    Category {
        id: 6080,
        name: "XXX/SD",
        description: "Adult SD",
    },
    Category {
        id: 6090,
        name: "XXX/WEB-DL",
        description: "Adult WEB-DL",
    },
    // Books
    Category {
        id: 7000,
        name: "Books",
        description: "Books",
    },
    Category {
        id: 7010,
        name: "Books/Mags",
        description: "Magazines",
    },
    Category {
        id: 7020,
        name: "Books/EBook",
        description: "E-books",
    },
    Category {
        id: 7030,
        name: "Books/Comics",
        description: "Comics",
    },
    Category {
        id: 7040,
        name: "Books/Technical",
        description: "Technical books",
    },
    Category {
        id: 7050,
        name: "Books/Other",
        description: "Other books",
    },
    Category {
        id: 7060,
        name: "Books/Foreign",
        description: "Foreign books",
    },
    // Other
    Category {
        id: 8000,
        name: "Other",
        description: "Other",
    },
    Category {
        id: 8010,
        name: "Other/Misc",
        description: "Miscellaneous",
    },
    Category {
        id: 8020,
        name: "Other/Hashed",
        description: "Hashed releases",
    },
];

/// Get category by ID
#[allow(dead_code)]
pub fn get_category(id: i32) -> Option<&'static Category> {
    CATEGORIES.iter().find(|c| c.id == id)
}

/// Get parent category ID (e.g., 2030 -> 2000)
#[allow(dead_code)]
pub fn parent_category(id: i32) -> i32 {
    (id / 1000) * 1000
}
