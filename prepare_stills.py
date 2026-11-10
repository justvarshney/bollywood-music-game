#!/usr/bin/env python3
"""
Bollywood Movie Still Preparer
Scans the `stills/` directory for movie still images (.jpg, .png, .webp, .svg),
matches them with movie metadata, and updates `stills_data.json`.
Preserves any custom hints or calibrations you add to `stills_data.json`.
"""

import os
import json
import re

STILLS_DIR = "stills"
DATA_FILE = "stills_data.json"
SUPPORTED_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".svg"}

# Built-in curated metadata library for iconic Bollywood films
DEFAULT_METADATA = [
    {
        "id": "still_1",
        "movie": "Dilwale Dulhania Le Jayenge",
        "year": 1995,
        "leadCast": "Shah Rukh Khan, Kajol, Amrish Puri",
        "director": "Aditya Chopra",
        "iconicDialogue": "Bade bade deshon mein aisi choti choti baatein hoti rehti hain, Senorita!",
        "sceneDescription": "Raj extending his hand to Simran from the moving train door amidst lush green fields.",
        "clue1": "1995 • Directed by Aditya Chopra (YRF)",
        "clue2": "Starring: Shah Rukh Khan & Kajol",
        "clue3": "Iconic yellow mustard fields & Eurail train climax scene",
        "image": "stills/Dilwale Dulhania Le Jayenge.svg"
    },
    {
        "id": "still_2",
        "movie": "Sholay",
        "year": 1975,
        "leadCast": "Amitabh Bachchan, Dharmendra, Amjad Khan, Hema Malini",
        "director": "Ramesh Sippy",
        "iconicDialogue": "Kitne aadmi the? ... Yeh haath humko de de Thakur!",
        "sceneDescription": "Gabbar Singh pacing over rocky boulders in Ramgarh with his cartridge belt.",
        "clue1": "1975 • Epic Dacoit Western classic",
        "clue2": "Starring: Amitabh Bachchan, Dharmendra, Sanjeev Kumar, Amjad Khan",
        "clue3": "Jai & Veeru riding a motorcycle with a sidecar singing 'Yeh Dosti'",
        "image": "stills/Sholay.svg"
    },
    {
        "id": "still_3",
        "movie": "3 Idiots",
        "year": 2009,
        "leadCast": "Aamir Khan, R. Madhavan, Sharman Joshi, Boman Irani",
        "director": "Rajkumar Hirani",
        "iconicDialogue": "Aal Izz Well! ... Kamyabi ke peeche mat bhago, kabil bano!",
        "sceneDescription": "Rancho, Raju, and Farhan sitting on the water tank ledge of their engineering college.",
        "clue1": "2009 • Blockbuster campus comedy directed by Rajkumar Hirani",
        "clue2": "Starring: Aamir Khan, R. Madhavan, Sharman Joshi, Kareena Kapoor",
        "clue3": "Pangong Lake scooter climax & Virus's famous imperial pen",
        "image": "stills/3 Idiots.svg"
    },
    {
        "id": "still_4",
        "movie": "Kabhi Khushi Kabhie Gham",
        "year": 2001,
        "leadCast": "Amitabh Bachchan, Jaya Bachchan, Shah Rukh Khan, Kajol, Hrithik Roshan, Kareena Kapoor",
        "director": "Karan Johar",
        "iconicDialogue": "Kabhi khushi kabhie gham... keh diya na, bas keh diya!",
        "sceneDescription": "Rahul stepping out of the helicopter landing on the lawn of the grand Raichand mansion.",
        "clue1": "2001 • Grand family saga produced by Dharma Productions",
        "clue2": "Starring: Amitabh, Jaya, SRK, Kajol, Hrithik, Kareena ('Poo')",
        "clue3": "Helicopter entry scene & the iconic Chandni Chowk Diwali Aarti",
        "image": "stills/Kabhi Khushi Kabhie Gham.svg"
    },
    {
        "id": "still_5",
        "movie": "Lagaan",
        "year": 2001,
        "leadCast": "Aamir Khan, Gracy Singh, Rachel Shelley, Paul Blackthorne",
        "director": "Ashutosh Gowariker",
        "iconicDialogue": "Hum jeet gaye! ... Teen guna lagaan maaf!",
        "sceneDescription": "Bhuvan and the villagers in dhoti-kurta lining up on the dusty pitch to face the British cricket team.",
        "clue1": "2001 • Oscar-nominated historic sports drama",
        "clue2": "Starring: Aamir Khan as Bhuvan against Captain Russell",
        "clue3": "Cricket match between villagers and British officers in Champaner",
        "image": "stills/Lagaan.svg"
    },
    {
        "id": "still_6",
        "movie": "Dil Chahta Hai",
        "year": 2001,
        "leadCast": "Aamir Khan, Saif Ali Khan, Akshaye Khanna, Preity Zinta",
        "director": "Farhan Akhtar",
        "iconicDialogue": "Hum dost the, hain aur rahenge... Ya toh dosti gehri hai, ya yeh photo 3D hai!",
        "sceneDescription": "Akash, Sameer, and Sid sitting side-by-side on the stone ledge of Chapora Fort overlooking the Goa sea.",
        "clue1": "2001 • Cult classic redefining modern friendship & road trips",
        "clue2": "Starring: Aamir Khan, Saif Ali Khan, Akshaye Khanna",
        "clue3": "Goa trip scene at Chapora Fort overlooking the sea",
        "image": "stills/Dil Chahta Hai.svg"
    },
    {
        "id": "still_7",
        "movie": "Andaz Apna Apna",
        "year": 1994,
        "leadCast": "Aamir Khan, Salman Khan, Raveena Tandon, Karisma Kapoor, Paresh Rawal",
        "director": "Rajkumar Santoshi",
        "iconicDialogue": "Teja main hoon, mark idhar hai! ... Crime Master Gogo naam hai mera, aankhen nikaal kar gotiyan khelta hoon!",
        "sceneDescription": "Amar and Prem bickering over chai cups while plotting to win Raveena's heart.",
        "clue1": "1994 • Cult comedy starring Aamir Khan and Salman Khan",
        "clue2": "Features Crime Master Gogo, Robert, Bhalla, and twin Tejas",
        "clue3": "'Do mastaane chale zindagi banane' & hilarious Vasco Da Gama gun scene",
        "image": "stills/Andaz Apna Apna.svg"
    },
    {
        "id": "still_8",
        "movie": "Jab We Met",
        "year": 2007,
        "leadCast": "Shahid Kapoor, Kareena Kapoor",
        "director": "Imtiaz Ali",
        "iconicDialogue": "Main apni favorite hoon! ... Sikhni hoon main Bhatinda ki!",
        "sceneDescription": "Geet chatting non-stop with a depressed Aditya inside the sleeper train compartment.",
        "clue1": "2007 • Directed by Imtiaz Ali",
        "clue2": "Starring: Shahid Kapoor (Aditya) & Kareena Kapoor (Geet)",
        "clue3": "Train missed at Ratlam station & the hotel 'Decent' scene",
        "image": "stills/Jab We Met.svg"
    },
    {
        "id": "still_9",
        "movie": "Hera Pheri",
        "year": 2000,
        "leadCast": "Akshay Kumar, Suniel Shetty, Paresh Rawal, Tabu",
        "director": "Priyadarshan",
        "iconicDialogue": "Yeh Baburao ka style hai! ... Utha le re baba, utha le!",
        "sceneDescription": "Baburao Apte wearing dhoti and thick specs arguing over the wrong number phone call for Star Garage.",
        "clue1": "2000 • Legendary comedy directed by Priyadarshan",
        "clue2": "Starring: Baburao Ganpatrao Apte, Raju & Shyam",
        "clue3": "Wrong number call from Kabira kidnapping Devi Prasad's granddaughter",
        "image": "stills/Hera Pheri.svg"
    },
    {
        "id": "still_10",
        "movie": "Baazigar",
        "year": 1993,
        "leadCast": "Shah Rukh Khan, Kajol, Shilpa Shetty",
        "director": "Abbas-Mustan",
        "iconicDialogue": "Kabhi kabhi jeetne ke liye kuch haarna bhi padta hai, aur haar kar jeetne wale ko Baazigar kehte hain!",
        "sceneDescription": "Ajay Sharma wearing a long black coat and contact lenses on the terrace before pushing Seema.",
        "clue1": "1993 • Thriller directed by Abbas-Mustan",
        "clue2": "Starring: Shah Rukh Khan in an iconic anti-hero revenge role",
        "clue3": "Famous rooftop push scene & dual identity (Vicky Malhotra)",
        "image": "stills/Baazigar.svg"
    },
    {
        "id": "still_11",
        "movie": "Munna Bhai M.B.B.S.",
        "year": 2003,
        "leadCast": "Sanjay Dutt, Arshad Warsi, Boman Irani, Gracy Singh",
        "director": "Rajkumar Hirani",
        "iconicDialogue": "Jaadu ki jhappi! ... tension lene ka nahi, sirf dene ka!",
        "sceneDescription": "Munna and Circuit orchestrating a fake hospital to fool Munna's visiting parents.",
        "clue1": "2003 • Directed by Rajkumar Hirani",
        "clue2": "Starring: Sanjay Dutt (Munna) & Arshad Warsi (Circuit)",
        "clue3": "Doctor Asthana's laughter therapy & 'Carrom ramvanu, juice pivanu'",
        "image": "stills/Munna Bhai M.B.B.S..svg"
    },
    {
        "id": "still_12",
        "movie": "Kuch Kuch Hota Hai",
        "year": 1998,
        "leadCast": "Shah Rukh Khan, Kajol, Rani Mukerji",
        "director": "Karan Johar",
        "iconicDialogue": "Rahul is a cheater, he is a cheater! ... Kuch kuch hota hai Rahul, tum nahi samjhoge.",
        "sceneDescription": "Rahul and Anjali playing one-on-one basketball in college with Anjali's signature hairband.",
        "clue1": "1998 • Karan Johar's directorial debut",
        "clue2": "Starring: Shah Rukh Khan, Kajol, Rani Mukerji",
        "clue3": "St. Xavier's basketball faceoff & Shimla summer camp gazebo dance",
        "image": "stills/Kuch Kuch Hota Hai.svg"
    },
    {
        "id": "still_13",
        "movie": "Deewaar",
        "year": 1975,
        "leadCast": "Amitabh Bachchan, Shashi Kapoor, Nirupa Roy, Parveen Babi",
        "director": "Yash Chopra",
        "iconicDialogue": "Aaj mere paas buildinge hain, property hai, bank balance hai... tere paas kya hai? Mere paas Maa hai!",
        "sceneDescription": "Vijay and Inspector Ravi confronting each other in the warehouse regarding their mother.",
        "clue1": "1975 • Classic written by Salim-Javed, directed by Yash Chopra",
        "clue2": "Starring: Amitabh Bachchan as Angry Young Man Vijay & Shashi Kapoor",
        "clue3": "'Mera baap chor hai' tattoo & the immortal 'Mere paas Maa hai' duel",
        "image": "stills/Deewaar.svg"
    },
    {
        "id": "still_14",
        "movie": "Don",
        "year": 2006,
        "leadCast": "Shah Rukh Khan, Priyanka Chopra, Boman Irani, Arjun Rampal",
        "director": "Farhan Akhtar",
        "iconicDialogue": "Don ko pakadna mushkil hi nahi, namumkin hai! ... Don ke dushman ki sabse badi galti yeh hai ki woh Don ka dushman hai.",
        "sceneDescription": "Don in a stylish black suit lighting a cigar with 11 countries' police on his tail.",
        "clue1": "2006 • Stylish action thriller directed by Farhan Akhtar",
        "clue2": "Starring: Shah Rukh Khan, Priyanka Chopra (Roma / Jungli Billi)",
        "clue3": "Kuala Lumpur twin towers skybridge climax & red diary chase",
        "image": "stills/Don.svg"
    },
    {
        "id": "still_15",
        "movie": "Gangs of Wasseypur",
        "year": 2012,
        "leadCast": "Manoj Bajpayee, Nawazuddin Siddiqui, Richa Chadha, Tigmanshu Dhulia",
        "director": "Anurag Kashyap",
        "iconicDialogue": "Baap ka, dada ka, bhai ka, sabka badla lega re tera Faizal! ... Teri keh ke lunga!",
        "sceneDescription": "Faizal Khan smoking a beedi with aviators and gamchha draped over his shoulder.",
        "clue1": "2012 • Gritty crime epic directed by Anurag Kashyap",
        "clue2": "Starring: Manoj Bajpayee (Sardar Khan) & Nawazuddin Siddiqui (Faizal)",
        "clue3": "Coal mafia rivalry in Dhanbad & 'Hindustan mein jab tak cinema hai...'",
        "image": "stills/Gangs of Wasseypur.svg"
    },
    {
        "id": "still_16",
        "movie": "PK",
        "year": 2014,
        "leadCast": "Aamir Khan, Anushka Sharma, Sushant Singh Rajput, Sanjay Dutt",
        "director": "Rajkumar Hirani",
        "iconicDialogue": "Wrong number hai! ... Hum confuse ho gaye hain!",
        "sceneDescription": "PK wearing a yellow scooter helmet, oversized coat, and carrying a vintage cassette player.",
        "clue1": "2014 • Satirical blockbuster directed by Rajkumar Hirani",
        "clue2": "Starring: Aamir Khan with wide green eyes, Anushka Sharma (Jagu)",
        "clue3": "Lost spaceship remote & dancing car battery theft scene",
        "image": "stills/PK.svg"
    },
    {
        "id": "still_17",
        "movie": "Zindagi Na Milegi Dobara",
        "year": 2011,
        "leadCast": "Hrithik Roshan, Farhan Akhtar, Abhay Deol, Katrina Kaif, Kalki Koechlin",
        "director": "Zoya Akhtar",
        "iconicDialogue": "Insaan ko dibbe mein sirf tab hona chahiye jab woh mar chuka ho... Seize the day my friend!",
        "sceneDescription": "Arjun, Kabir, and Imran covered in red tomato pulp during the Tomatina festival in Spain.",
        "clue1": "2011 • Road trip drama directed by Zoya Akhtar",
        "clue2": "Starring: Hrithik Roshan, Farhan Akhtar, Abhay Deol",
        "clue3": "Spain bachelor trip: Deep sea diving, Tomatina & Skydiving",
        "image": "stills/Zindagi Na Milegi Dobara.svg"
    },
    {
        "id": "still_18",
        "movie": "Chak De! India",
        "year": 2007,
        "leadCast": "Shah Rukh Khan, Vidya Malvade, Sagarika Ghatge, Shilpa Shukla",
        "director": "Shimit Amin",
        "iconicDialogue": "Sattar minute, sattar minute hain tumhare paas! Shayad tumhari zindagi ke sabse khaas sattar minute!",
        "sceneDescription": "Coach Kabir Khan delivering the immortal locker room motivational speech before the final match.",
        "clue1": "2007 • Landmark sports drama produced by YRF",
        "clue2": "Starring: Shah Rukh Khan as Kabir Khan coaching the women's hockey team",
        "clue3": "World Cup hockey final in Melbourne & the 'Sattar Minute' speech",
        "image": "stills/Chak De! India.svg"
    },
    {
        "id": "still_19",
        "movie": "Queen",
        "year": 2014,
        "leadCast": "Kangana Ranaut, Rajkummar Rao, Lisa Haydon",
        "director": "Vikas Bahl",
        "iconicDialogue": "Mera haal na Gupta uncle ke jaise ho gaya hai... London thumakda!",
        "sceneDescription": "Rani carrying her handbag alone across Paris streets after her wedding is called off.",
        "clue1": "2014 • Empowering comedy directed by Vikas Bahl",
        "clue2": "Starring: Kangana Ranaut as Rani from Rajouri Garden",
        "clue3": "Solo honeymoon trip across Paris and Amsterdam hostel roommates",
        "image": "stills/Queen.svg"
    },
    {
        "id": "still_20",
        "movie": "Om Shanti Om",
        "year": 2007,
        "leadCast": "Shah Rukh Khan, Deepika Padukone, Arjun Rampal, Shreyas Talpade",
        "director": "Farah Khan",
        "iconicDialogue": "Itni shiddat se maine tumhe paane ki koshish ki hai... Picture abhi baaki hai mere dost!",
        "sceneDescription": "Junior artist Om waving frantically as superstar Shantipriya steps onto the red carpet in her pink retro gown.",
        "clue1": "2007 • Farah Khan's retro reincarnation tribute to 70s Bollywood",
        "clue2": "Starring: Shah Rukh Khan & debutante Deepika Padukone",
        "clue3": "Chandelier fire accident & giant disco ball song 'Dard-e-Disco'",
        "image": "stills/Om Shanti Om.svg"
    }
]

def clean_name(filename):
    """Strip extension and split camelCase, numbers, and snake_case."""
    name = os.path.splitext(filename)[0]
    s1 = re.sub(r'([a-z0-9])([A-Z])', r'\1 \2', name)
    s2 = re.sub(r'([A-Za-z])([0-9])', r'\1 \2', s1)
    return re.sub(r'[\s_]+', ' ', s2).strip()

def prepare_stills():
    os.makedirs(STILLS_DIR, exist_ok=True)
    
    # Load existing data if available to preserve calibrations
    existing_by_movie = {}
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                for item in data:
                    existing_by_movie[item['movie'].lower().strip()] = item
        except Exception as e:
            print(f"Warning reading {DATA_FILE}: {e}")

    # Index files from stills/ directory
    # Prioritize real screenshots (.jpg, .jpeg, .png, .webp) over placeholder .svg
    def ext_priority(filename):
        ext = os.path.splitext(filename)[1].lower()
        return 0 if ext in {".jpg", ".jpeg", ".png", ".webp"} else 1

    found_files = []
    if os.path.exists(STILLS_DIR):
        raw_files = [f for f in os.listdir(STILLS_DIR) if os.path.splitext(f)[1].lower() in SUPPORTED_EXTS]
        raw_files.sort(key=lambda f: (ext_priority(f), f.lower()))
        found_files = raw_files

    print(f"Found {len(found_files)} image files in '{STILLS_DIR}/'.")

    # Combine default library with scanned files
    library_map = {item['movie'].lower().strip(): item for item in DEFAULT_METADATA}
    
    final_items = []
    seen_movies = set()

    # First, handle files present in stills/
    for f in found_files:
        movie_title = clean_name(f)
        key = movie_title.lower().strip()
        if key in seen_movies:
            continue
        
        # Check if we have library or existing metadata
        base_meta = existing_by_movie.get(key) or library_map.get(key, {})
        
        item = {
            "id": f"still_{len(final_items) + 1}",
            "movie": base_meta.get("movie", movie_title),
            "year": base_meta.get("year", "Classic"),
            "leadCast": base_meta.get("leadCast", "Iconic Bollywood Ensemble"),
            "director": base_meta.get("director", "Famous Director"),
            "iconicDialogue": base_meta.get("iconicDialogue", "A dialogue etched into Bollywood history!"),
            "sceneDescription": base_meta.get("sceneDescription", f"Iconic freeze frame from {movie_title}."),
            "clue1": base_meta.get("clue1", f"Classic Film • {base_meta.get('year', '')}"),
            "clue2": base_meta.get("clue2", f"Starring: {base_meta.get('leadCast', '')}"),
            "clue3": base_meta.get("clue3", base_meta.get("sceneDescription", "")),
            "image": f"{STILLS_DIR}/{f}"
        }
        final_items.append(item)
        seen_movies.add(key)

    # For library items not yet provided as custom user files, append them with default/SVG path
    for item in DEFAULT_METADATA:
        key = item['movie'].lower().strip()
        if key not in seen_movies:
            # Preserve existing if user tweaked it
            merged = existing_by_movie.get(key, item)
            merged["id"] = f"still_{len(final_items) + 1}"
            final_items.append(merged)
            seen_movies.add(key)

    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(final_items, f, indent=2, ensure_ascii=False)

    print(f"✅ Successfully wrote {len(final_items)} movie stills to '{DATA_FILE}'.")

if __name__ == "__main__":
    prepare_stills()
