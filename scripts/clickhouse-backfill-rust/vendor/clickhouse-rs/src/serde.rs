//! Contains ser/de modules for different external types.

use serde::{
    de::{Deserialize, Deserializer},
    ser::{Serialize, Serializer},
};

macro_rules! option {
    ($name:ident, $doc:literal) => {
        #[doc = $doc]
        pub mod option {
            use super::*;

            struct $name(super::$name);

            impl Serialize for $name {
                fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
                    super::serialize(&self.0, serializer)
                }
            }

            impl<'de> Deserialize<'de> for $name {
                fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
                    super::deserialize(deserializer).map($name)
                }
            }

            pub fn serialize<S>(v: &Option<super::$name>, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                v.clone().map($name).serialize(serializer)
            }

            pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<super::$name>, D::Error>
            where
                D: Deserializer<'de>,
            {
                let opt: Option<$name> = Deserialize::deserialize(deserializer)?;
                Ok(opt.map(|v| v.0))
            }
        }
    };
}

/// Ser/de [`std::net::Ipv4Addr`] to/from `IPv4`.
pub mod ipv4 {
    use std::net::Ipv4Addr;

    use super::*;

    option!(
        Ipv4Addr,
        "Ser/de `Option<Ipv4Addr>` to/from `Nullable(IPv4)`."
    );

    pub fn serialize<S>(ipv4: &Ipv4Addr, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        u32::from(*ipv4).serialize(serializer)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Ipv4Addr, D::Error>
    where
        D: Deserializer<'de>,
    {
        let ip: u32 = Deserialize::deserialize(deserializer)?;
        Ok(Ipv4Addr::from(ip))
    }
}

/// Ser/de [`::uuid::Uuid`] to/from `UUID`.
#[cfg(feature = "uuid")]
pub mod uuid {
    use ::uuid::Uuid;
    use serde::de::Error;

    use super::*;

    option!(Uuid, "Ser/de `Option<Uuid>` to/from `Nullable(UUID)`.");

    pub fn serialize<S>(uuid: &Uuid, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        if serializer.is_human_readable() {
            uuid.to_string().serialize(serializer)
        } else {
            let bytes = uuid.as_u64_pair();
            bytes.serialize(serializer)
        }
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Uuid, D::Error>
    where
        D: Deserializer<'de>,
    {
        if deserializer.is_human_readable() {
            let uuid_str: &str = Deserialize::deserialize(deserializer)?;
            Uuid::parse_str(uuid_str).map_err(D::Error::custom)
        } else {
            let bytes: (u64, u64) = Deserialize::deserialize(deserializer)?;
            Ok(Uuid::from_u64_pair(bytes.0, bytes.1))
        }
    }
}

#[cfg(feature = "chrono")]
pub mod chrono {
    use super::*;
    use ::chrono::{DateTime, Utc};
    use serde::{de::Error as _, ser::Error as _};

    pub mod datetime {
        use super::*;

        type DateTimeUtc = DateTime<Utc>;

        option!(
            DateTimeUtc,
            "Ser/de `Option<DateTime<Utc>>` to/from `Nullable(DateTime)`."
        );

        pub fn serialize<S>(dt: &DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: Serializer,
        {
            let ts = dt.timestamp();

            u32::try_from(ts)
                .map_err(|_| S::Error::custom(format!("{dt} cannot be represented as DateTime")))?
                .serialize(serializer)
        }

        pub fn deserialize<'de, D>(deserializer: D) -> Result<DateTime<Utc>, D::Error>
        where
            D: Deserializer<'de>,
        {
            let ts: u32 = Deserialize::deserialize(deserializer)?;
            DateTime::<Utc>::from_timestamp(i64::from(ts), 0).ok_or_else(|| {
                D::Error::custom(format!("{ts} cannot be converted to DateTime<Utc>"))
            })
        }
    }

    /// Contains modules to ser/de `DateTime<Utc>` to/from `DateTime64(_)`.
    pub mod datetime64 {
        use super::*;
        type DateTimeUtc = DateTime<Utc>;

        /// Ser/de `DateTime<Utc>` to/from `DateTime64(0)` (seconds).
        pub mod secs {
            use super::*;

            option!(
                DateTimeUtc,
                "Ser/de `Option<OffsetDateTime>` to/from `Nullable(DateTime64(0))`."
            );

            pub fn serialize<S>(dt: &DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                let ts = dt.timestamp();
                ts.serialize(serializer)
            }

            pub fn deserialize<'de, D>(deserializer: D) -> Result<DateTime<Utc>, D::Error>
            where
                D: Deserializer<'de>,
            {
                let ts: i64 = Deserialize::deserialize(deserializer)?;
                DateTime::<Utc>::from_timestamp(ts, 0).ok_or_else(|| {
                    D::Error::custom(format!("Can't create DateTime<Utc> from {ts}"))
                })
            }
        }

        /// Ser/de `DateTime<Utc>` to/from `DateTime64(3)` (milliseconds).
        pub mod millis {
            use super::*;

            option!(
                DateTimeUtc,
                "Ser/de `Option<DateTime<Utc>>` to/from `Nullable(DateTime64(3))`."
            );

            pub fn serialize<S>(dt: &DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                let ts = dt.timestamp_millis();
                ts.serialize(serializer)
            }

            pub fn deserialize<'de, D>(deserializer: D) -> Result<DateTime<Utc>, D::Error>
            where
                D: Deserializer<'de>,
            {
                let ts: i64 = Deserialize::deserialize(deserializer)?;
                DateTime::<Utc>::from_timestamp_millis(ts).ok_or_else(|| {
                    D::Error::custom(format!("Can't create DateTime<Utc> from {ts}"))
                })
            }
        }

        /// Ser/de `DateTime<Utc>` to/from `DateTime64(6)` (microseconds).
        pub mod micros {
            use super::*;

            option!(
                DateTimeUtc,
                "Ser/de `Option<DateTime<Utc>>` to/from `Nullable(DateTime64(6))`."
            );

            pub fn serialize<S>(dt: &DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                let ts = dt.timestamp_micros();
                ts.serialize(serializer)
            }

            pub fn deserialize<'de, D>(deserializer: D) -> Result<DateTime<Utc>, D::Error>
            where
                D: Deserializer<'de>,
            {
                let ts: i64 = Deserialize::deserialize(deserializer)?;
                DateTime::<Utc>::from_timestamp_micros(ts).ok_or_else(|| {
                    D::Error::custom(format!("Can't create DateTime<Utc> from {ts}"))
                })
            }
        }

        /// Ser/de `DateTime<Utc>` to/from `DateTime64(9)` (nanoseconds).
        pub mod nanos {
            use super::*;

            option!(
                DateTimeUtc,
                "Ser/de `Option<DateTime<Utc>>` to/from `Nullable(DateTime64(9))`."
            );

            pub fn serialize<S>(dt: &DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                let ts = dt.timestamp_nanos_opt().ok_or_else(|| {
                    S::Error::custom(format!("{dt} cannot be represented as DateTime64"))
                })?;
                ts.serialize(serializer)
            }

            pub fn deserialize<'de, D>(deserializer: D) -> Result<DateTime<Utc>, D::Error>
            where
                D: Deserializer<'de>,
            {
                let ts: i64 = Deserialize::deserialize(deserializer)?;
                Ok(DateTime::<Utc>::from_timestamp_nanos(ts))
            }
        }
    }

    /// Ser/de `time::Date` to/from `Date`.
    pub mod date {
        use super::*;
        use ::chrono::{Duration, NaiveDate};

        option!(
            NaiveDate,
            "Ser/de `Option<NaiveDate>` to/from `Nullable(Date)`."
        );

        const ORIGIN: Option<NaiveDate> = NaiveDate::from_yo_opt(1970, 1);

        pub fn serialize<S>(date: &NaiveDate, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: Serializer,
        {
            let origin = ORIGIN.unwrap();
            if *date < origin {
                let msg = format!("{date} cannot be represented as Date");
                return Err(S::Error::custom(msg));
            }

            let elapsed = *date - origin; // cannot underflow: checked above
            let days = elapsed.num_days();

            u16::try_from(days)
                .map_err(|_| S::Error::custom(format!("{date} cannot be represented as Date")))?
                .serialize(serializer)
        }

        pub fn deserialize<'de, D>(deserializer: D) -> Result<NaiveDate, D::Error>
        where
            D: Deserializer<'de>,
        {
            let days: u16 = Deserialize::deserialize(deserializer)?;
            Ok(ORIGIN.unwrap() + Duration::days(i64::from(days))) // cannot overflow: always < `Date::MAX`
        }
    }

    /// Ser/de `time::Date` to/from `Date32`.
    pub mod date32 {
        use ::chrono::{Duration, NaiveDate};

        use super::*;

        option!(
            NaiveDate,
            "Ser/de `Option<NaiveDate>` to/from `Nullable(Date32)`."
        );

        const ORIGIN: Option<NaiveDate> = NaiveDate::from_yo_opt(1970, 1);

        // NOTE: actually, it's 1925 and 2283 with a tail for versions before 22.8-lts.
        const MIN: Option<NaiveDate> = NaiveDate::from_yo_opt(1900, 1);
        const MAX: Option<NaiveDate> = NaiveDate::from_yo_opt(2299, 365);

        pub fn serialize<S>(date: &NaiveDate, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: Serializer,
        {
            if *date < MIN.unwrap() || *date > MAX.unwrap() {
                let msg = format!("{date} cannot be represented as Date");
                return Err(S::Error::custom(msg));
            }

            let elapsed = *date - ORIGIN.unwrap(); // cannot underflow: checked above
            let days = elapsed.num_days();

            i32::try_from(days)
                .map_err(|_| S::Error::custom(format!("{date} cannot be represented as Date32")))?
                .serialize(serializer)
        }

        pub fn deserialize<'de, D>(deserializer: D) -> Result<NaiveDate, D::Error>
        where
            D: Deserializer<'de>,
        {
            let days: i32 = Deserialize::deserialize(deserializer)?;

            // It shouldn't overflow, because clamped by CH and < `Date::MAX`.
            // TODO: ensure CH clamps when an invalid value is inserted in binary format.
            Ok(ORIGIN.unwrap() + Duration::days(i64::from(days)))
        }
    }

    /// Ser/de `chrono::Duration` to/from `Time`.
    pub mod time {
        use super::*;
        use ::chrono::Duration;

        option!(
            Duration,
            "Ser/de `Option<Duration>` to/from `Nullable(Time)`."
        );

        pub fn serialize<S>(time: &Duration, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: Serializer,
        {
            i32::try_from(time.num_seconds())
                .map_err(|_| S::Error::custom(format!("{time} cannot be represented as Time")))?
                .serialize(serializer)
        }

        pub fn deserialize<'de, D>(deserializer: D) -> Result<Duration, D::Error>
        where
            D: Deserializer<'de>,
        {
            let seconds: i32 = Deserialize::deserialize(deserializer)?;
            Ok(Duration::seconds(seconds as i64))
        }
    }

    /// Contains modules to ser/de `chrono::Duration` to/from `Time64(_)`.
    pub mod time64 {
        use super::*;
        use ::chrono::Duration;

        /// Ser/de `Duration` to/from `Time64(0)` (seconds).
        pub mod secs {
            use super::*;

            option!(
                Duration,
                "Ser/de `Option<Duration>` to/from `Nullable(Time64(0))`."
            );

            pub fn serialize<S>(time: &Duration, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                let seconds = time.num_seconds();
                seconds.serialize(serializer)
            }

            pub fn deserialize<'de, D>(deserializer: D) -> Result<Duration, D::Error>
            where
                D: Deserializer<'de>,
            {
                let seconds: i64 = Deserialize::deserialize(deserializer)?;
                Ok(Duration::seconds(seconds))
            }
        }

        /// Ser/de `Duration` to/from `Time64(3)` (milliseconds).
        pub mod millis {
            use super::*;

            option!(
                Duration,
                "Ser/de `Option<Duration>` to/from `Nullable(Time64(3))`."
            );

            pub fn serialize<S>(time: &Duration, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                let millis = time.num_milliseconds();
                millis.serialize(serializer)
            }

            pub fn deserialize<'de, D>(deserializer: D) -> Result<Duration, D::Error>
            where
                D: Deserializer<'de>,
            {
                let millis: i64 = Deserialize::deserialize(deserializer)?;
                Ok(Duration::milliseconds(millis))
            }
        }

        /// Ser/de `Duration` to/from `Time64(6)` (microseconds).
        pub mod micros {
            use super::*;

            option!(
                Duration,
                "Ser/de `Option<Duration>` to/from `Nullable(Time64(6))`."
            );

            pub fn serialize<S>(time: &Duration, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                let micros = time
                    .num_microseconds()
                    .ok_or_else(|| S::Error::custom("Duration too large to fit in i64 micros"))?;
                micros.serialize(serializer)
            }

            pub fn deserialize<'de, D>(deserializer: D) -> Result<Duration, D::Error>
            where
                D: Deserializer<'de>,
            {
                let micros: i64 = Deserialize::deserialize(deserializer)?;

                Ok(Duration::microseconds(micros))
            }
        }

        /// Ser/de `Duration` to/from `Time64(9)` (nanoseconds).
        pub mod nanos {
            use super::*;

            option!(
                Duration,
                "Ser/de `Option<Duration>` to/from `Nullable(Time64(9))`."
            );

            pub fn serialize<S>(time: &Duration, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                let nanos = time.num_nanoseconds().ok_or_else(|| {
                    S::Error::custom(format!("{time:?} too large for nanosecond precision"))
                })?;
                nanos.serialize(serializer)
            }

            pub fn deserialize<'de, D>(deserializer: D) -> Result<Duration, D::Error>
            where
                D: Deserializer<'de>,
            {
                let nanos: i64 = Deserialize::deserialize(deserializer)?;
                Ok(Duration::nanoseconds(nanos))
            }
        }
    }
}

/// Ser/de [`::time::OffsetDateTime`] and [`::time::Date`].
#[cfg(feature = "time")]
pub mod time {
    use std::convert::TryFrom;

    use ::time::{Date, Duration, OffsetDateTime, error::ComponentRange};
    use serde::{de::Error as _, ser::Error as _};

    use super::*;

    /// Ser/de `OffsetDateTime` to/from `DateTime`.
    pub mod datetime {
        use super::*;

        option!(
            OffsetDateTime,
            "Ser/de `Option<OffsetDateTime>` to/from `Nullable(DateTime)`."
        );

        pub fn serialize<S>(dt: &OffsetDateTime, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: Serializer,
        {
            let ts = dt.unix_timestamp();

            u32::try_from(ts)
                .map_err(|_| S::Error::custom(format!("{dt} cannot be represented as DateTime")))?
                .serialize(serializer)
        }

        pub fn deserialize<'de, D>(deserializer: D) -> Result<OffsetDateTime, D::Error>
        where
            D: Deserializer<'de>,
        {
            let ts: u32 = Deserialize::deserialize(deserializer)?;
            OffsetDateTime::from_unix_timestamp(i64::from(ts)).map_err(D::Error::custom)
        }
    }

    /// Contains modules to ser/de `OffsetDateTime` to/from `DateTime64(_)`.
    pub mod datetime64 {
        use super::*;

        /// Ser/de `OffsetDateTime` to/from `DateTime64(0)`.
        pub mod secs {
            use super::*;

            option!(
                OffsetDateTime,
                "Ser/de `Option<OffsetDateTime>` to/from `Nullable(DateTime64(0))`."
            );

            pub fn serialize<S>(dt: &OffsetDateTime, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                do_serialize(dt, 1_000_000_000, serializer)
            }

            pub fn deserialize<'de, D>(deserializer: D) -> Result<OffsetDateTime, D::Error>
            where
                D: Deserializer<'de>,
            {
                do_deserialize(deserializer, 1_000_000_000)
            }
        }

        /// Ser/de `OffsetDateTime` to/from `DateTime64(3)`.
        pub mod millis {
            use super::*;

            option!(
                OffsetDateTime,
                "Ser/de `Option<OffsetDateTime>` to/from `Nullable(DateTime64(3))`."
            );

            pub fn serialize<S>(dt: &OffsetDateTime, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                do_serialize(dt, 1_000_000, serializer)
            }

            pub fn deserialize<'de, D>(deserializer: D) -> Result<OffsetDateTime, D::Error>
            where
                D: Deserializer<'de>,
            {
                do_deserialize(deserializer, 1_000_000)
            }
        }

        /// Ser/de `OffsetDateTime` to/from `DateTime64(6)`.
        pub mod micros {
            use super::*;

            option!(
                OffsetDateTime,
                "Ser/de `Option<OffsetDateTime>` to/from `Nullable(DateTime64(6))`."
            );

            pub fn serialize<S>(dt: &OffsetDateTime, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                do_serialize(dt, 1_000, serializer)
            }

            pub fn deserialize<'de, D>(deserializer: D) -> Result<OffsetDateTime, D::Error>
            where
                D: Deserializer<'de>,
            {
                do_deserialize(deserializer, 1_000)
            }
        }

        /// Ser/de `OffsetDateTime` to/from `DateTime64(9)`.
        pub mod nanos {
            use super::*;

            option!(
                OffsetDateTime,
                "Ser/de `Option<OffsetDateTime>` to/from `Nullable(DateTime64(9))`."
            );

            pub fn serialize<S>(dt: &OffsetDateTime, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                do_serialize(dt, 1, serializer)
            }

            pub fn deserialize<'de, D>(deserializer: D) -> Result<OffsetDateTime, D::Error>
            where
                D: Deserializer<'de>,
            {
                do_deserialize(deserializer, 1)
            }
        }

        fn do_serialize<S>(dt: &OffsetDateTime, div: i128, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: Serializer,
        {
            let ts = dt.unix_timestamp_nanos() / div;

            i64::try_from(ts)
                .map_err(|_| S::Error::custom(format!("{dt} cannot be represented as DateTime64")))?
                .serialize(serializer)
        }

        fn do_deserialize<'de, D>(deserializer: D, mul: i128) -> Result<OffsetDateTime, D::Error>
        where
            D: Deserializer<'de>,
        {
            let ts: i64 = Deserialize::deserialize(deserializer)?;
            let ts = i128::from(ts) * mul; // cannot overflow: `mul` fits in `i64`
            OffsetDateTime::from_unix_timestamp_nanos(ts).map_err(D::Error::custom)
        }
    }

    /// Ser/de `time::Date` to/from `Date`.
    pub mod date {
        use super::*;

        option!(
            Date,
            "Ser/de `Option<time::Date>` to/from `Nullable(Date)`."
        );

        const ORIGIN: Result<Date, ComponentRange> = Date::from_ordinal_date(1970, 1);

        pub fn serialize<S>(date: &Date, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: Serializer,
        {
            let origin = ORIGIN.unwrap();
            if *date < origin {
                let msg = format!("{date} cannot be represented as Date");
                return Err(S::Error::custom(msg));
            }

            let elapsed = *date - origin; // cannot underflow: checked above
            let days = elapsed.whole_days();

            u16::try_from(days)
                .map_err(|_| S::Error::custom(format!("{date} cannot be represented as Date")))?
                .serialize(serializer)
        }

        pub fn deserialize<'de, D>(deserializer: D) -> Result<Date, D::Error>
        where
            D: Deserializer<'de>,
        {
            let days: u16 = Deserialize::deserialize(deserializer)?;
            Ok(ORIGIN.unwrap() + Duration::days(i64::from(days))) // cannot overflow: always < `Date::MAX`
        }
    }

    /// Ser/de `time::Date` to/from `Date32`.
    pub mod date32 {
        use super::*;

        option!(
            Date,
            "Ser/de `Option<time::Date>` to/from `Nullable(Date32)`."
        );

        const ORIGIN: Result<Date, ComponentRange> = Date::from_ordinal_date(1970, 1);

        // NOTE: actually, it's 1925 and 2283 with a tail for versions before 22.8-lts.
        const MIN: Result<Date, ComponentRange> = Date::from_ordinal_date(1900, 1);
        const MAX: Result<Date, ComponentRange> = Date::from_ordinal_date(2299, 365);

        pub fn serialize<S>(date: &Date, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: Serializer,
        {
            if *date < MIN.unwrap() || *date > MAX.unwrap() {
                let msg = format!("{date} cannot be represented as Date");
                return Err(S::Error::custom(msg));
            }

            let elapsed = *date - ORIGIN.unwrap(); // cannot underflow: checked above
            let days = elapsed.whole_days();

            i32::try_from(days)
                .map_err(|_| S::Error::custom(format!("{date} cannot be represented as Date32")))?
                .serialize(serializer)
        }

        pub fn deserialize<'de, D>(deserializer: D) -> Result<Date, D::Error>
        where
            D: Deserializer<'de>,
        {
            let days: i32 = Deserialize::deserialize(deserializer)?;

            // It shouldn't overflow, because clamped by CH and < `Date::MAX`.
            // TODO: ensure CH clamps when an invalid value is inserted in binary format.
            Ok(ORIGIN.unwrap() + Duration::days(i64::from(days)))
        }
    }

    /// Ser/de `time::Duration` to/from `Time`.
    #[allow(clippy::module_inception)]
    pub mod time {
        use super::*;
        use ::time::Duration;

        option!(
            Duration,
            "Ser/de `Option<time::Duration>` to/from `Nullable(Time)`."
        );

        pub fn serialize<S>(duration: &Duration, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: Serializer,
        {
            let total_seconds = duration.whole_seconds();
            i32::try_from(total_seconds)
                .map_err(|_| S::Error::custom(format!("{duration} cannot be represented as Time")))?
                .serialize(serializer)
        }

        pub fn deserialize<'de, D>(deserializer: D) -> Result<Duration, D::Error>
        where
            D: Deserializer<'de>,
        {
            let seconds: i32 = Deserialize::deserialize(deserializer)?;
            Ok(Duration::seconds(seconds.into()))
        }
    }

    pub mod time64 {
        use super::*;
        use ::time::Duration;

        /// Ser/de `Duration` to/from `Time64(0)` (seconds).
        pub mod secs {
            use super::*;

            option!(
                Duration,
                "Ser/de `Option<Duration>` to/from `Nullable(Time64(0))`."
            );

            pub fn serialize<S>(duration: &Duration, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                duration.whole_seconds().serialize(serializer)
            }

            pub fn deserialize<'de, D>(deserializer: D) -> Result<Duration, D::Error>
            where
                D: Deserializer<'de>,
            {
                let seconds: i64 = Deserialize::deserialize(deserializer)?;
                Ok(Duration::seconds(seconds))
            }
        }

        /// Ser/de `Duration` to/from `Time64(3)` (milliseconds).
        pub mod millis {
            use super::*;

            option!(
                Duration,
                "Ser/de `Option<Duration>` to/from `Nullable(Time64(3))`."
            );

            pub fn serialize<S>(duration: &Duration, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                let millis_i128 = duration.whole_milliseconds();
                let millis_i64 = i64::try_from(millis_i128).map_err(|_| {
                    S::Error::custom(format!(
                        "Duration {duration:?} milliseconds too large for i64"
                    ))
                })?;
                millis_i64.serialize(serializer)
            }

            pub fn deserialize<'de, D>(deserializer: D) -> Result<Duration, D::Error>
            where
                D: Deserializer<'de>,
            {
                let millis: i64 = Deserialize::deserialize(deserializer)?;
                Ok(Duration::milliseconds(millis))
            }
        }

        /// Ser/de `Duration` to/from `Time64(6)` (microseconds).
        pub mod micros {
            use super::*;

            option!(
                Duration,
                "Ser/de `Option<Duration>` to/from `Nullable(Time64(6))`."
            );

            pub fn serialize<S>(duration: &Duration, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                let micros_i128 = duration.whole_microseconds();
                let micros_i64 = i64::try_from(micros_i128).map_err(|_| {
                    S::Error::custom(format!(
                        "Duration {duration:?} microseconds too large for i64"
                    ))
                })?;
                micros_i64.serialize(serializer)
            }

            pub fn deserialize<'de, D>(deserializer: D) -> Result<Duration, D::Error>
            where
                D: Deserializer<'de>,
            {
                let micros: i64 = Deserialize::deserialize(deserializer)?;
                Ok(Duration::microseconds(micros))
            }
        }

        /// Ser/de `Duration` to/from `Time64(9)` (nanoseconds).
        pub mod nanos {
            use super::*;

            option!(
                Duration,
                "Ser/de `Option<Duration>` to/from `Nullable(Time64(9))`."
            );

            pub fn serialize<S>(duration: &Duration, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                let nanos_i128 = duration.whole_nanoseconds();
                let nanos_i64 = i64::try_from(nanos_i128).map_err(|_| {
                    S::Error::custom(format!(
                        "Duration {duration:?} nanoseconds too large for i64"
                    ))
                })?;
                nanos_i64.serialize(serializer)
            }

            pub fn deserialize<'de, D>(deserializer: D) -> Result<Duration, D::Error>
            where
                D: Deserializer<'de>,
            {
                let nanos: i64 = Deserialize::deserialize(deserializer)?;
                Ok(Duration::nanoseconds(nanos))
            }
        }
    }
}
